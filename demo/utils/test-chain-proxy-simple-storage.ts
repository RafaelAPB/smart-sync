import { Contract, ContractReceipt, ContractTransaction } from '@ethersproject/contracts';
import { JsonRpcProvider } from '@ethersproject/providers';
import {
    BigNumber,
    BigNumberish, ethers, Wallet,
} from 'ethers';
import { Trie } from 'merkle-patricia-tree/dist/baseTrie';
import { ProxyContract, RelayContract, SimpleStorage } from '../../src-gen/types';
import { PROXY_INTERFACE } from '../../src/config';
import ProxyContractBuilder from '../../src/utils/proxy-contract-builder';
import DiffHandler from '../../src/diffHandler/DiffHandler';
import { logger } from '../../src/utils/logger';
import {
    encode, hexStringToBuffer, hexToAscii,
} from '../../src/utils/utils';
import GetProof, { encodeAccount, formatProofNodes } from '../../src/proofHandler/GetProof';
import { Account, StorageProof } from '../../src/proofHandler/Types';
import { ChainProxy, encodeBlockHeader } from '../../src/chain-proxy';
import { TxContractInteractionOptions } from '../../src/cli/smart-sync';
import { ContractArtifacts } from './artifacts';
import { updateProxyContract } from './initialize-contracts';
import * as dotenv from "dotenv";

const {
    CONTRACT_TARGETCHAIN_PROXY, DEPLOYED_CONTRACT_ADDRESS_STORAGE_GOERLI_LOGIC_CONTRACT, DEPLOYED_CONTRACT_ADDRESS_STORAGE_MUMBAI, DEPLOYED_CONTRACT_ADDRESS_RELAY_GOERLI,
} = process.env;

const KEY_VALUE_PAIR_PER_BATCH = 100;

export interface InitializationResult {
    migrationState: Boolean;
    proxyContract: Contract;
    values: Array<number | string>;
    keys: Array<number | string>;
    max_mpt_depth: number;
    min_mpt_depth: number;
    initialValuesProof: GetProof;
    blockNumber?: number;
}

export interface MigrationResult {
    migrationResult: Boolean;
    receipt?: {
        gasUsed: ethers.BigNumber;
    };
    maxValueMptDept?: number;
    proofs?: GetProof;
}

export interface ChangeValueAtIndexResult {
    success: Boolean;
    newValue?: BigNumberish;
}

async function verifyStorageProof(storageProof: StorageProof, root) {
    const storageTrieKey = hexStringToBuffer(ethers.utils.keccak256(ethers.utils.hexZeroPad(storageProof.key, 32)));
    const storageTrieRoot = hexStringToBuffer(root);

    const proofValue = await Trie.verifyProof(storageTrieRoot, storageTrieKey, formatProofNodes(storageProof.proof));

    if (proofValue === null) {
        throw new Error(`Invalid storage proof: No storage value found for key: ${storageTrieKey.toString('hex')}`);
    }

    const val = storageProof.value === '0x0' ? Buffer.from([]) : hexStringToBuffer(ethers.BigNumber.from(storageProof.value).toHexString());
    const rlpValue = encode(val);

    if (!rlpValue.equals(proofValue)) {
        throw new Error('Invalid storage proof');
    }
    return true;
}

/**
 * Verifies inclusion proofs
 * @param proof, the proof as returned by `eth_getProof`
 * @param root, rootHash for the merkle proof
 * @throws If account or storage proofs are found to be invalid
 * @returns true if merkle proof could be verified, false otherwise
 * @see also [web3.py](https://github.com/ethereum/web3.py/blob/master/docs/web3.eth.rst)
 */
export async function verifyEthGetProof(proof: GetProof, root: string | Buffer): Promise<boolean> {
    if (typeof (root) === 'string') {
        return verifyEthGetProof(proof, hexStringToBuffer(root));
    }

    const acc = <Account>{
        nonce: proof.nonce,
        balance: proof.balance,
        storageHash: proof.storageHash,
        codeHash: proof.codeHash,
    };

    const rlpAccount = encodeAccount(acc);
    const trieKey = hexStringToBuffer(ethers.utils.keccak256(proof.address));

    const proofAcc = await Trie.verifyProof(root, trieKey, formatProofNodes(proof.accountProof));

    if (proofAcc === null) {
        throw new Error(`Invalid account proof: No account value found for key: ${trieKey.toString('hex')}`);
    }
    if (!rlpAccount.equals(proofAcc)) {
        throw new Error('Invalid account proof: accounts do not match');
    }

    const verifications = await Promise.all(proof.storageProof.map((storageProof) => verifyStorageProof(storageProof, proof.storageHash)));
    const faultyIndex = verifications.findIndex((verifier) => verifier === false);
    return faultyIndex < 0;
}

export class TestChainProxySimpleStorage {
    readonly values: Array<number | string> = [];

    readonly keys: Array<number | string> = [];

    private proxyContract: Contract;

    readonly srcContract: SimpleStorage;

    readonly srcProvider: JsonRpcProvider;

    readonly targetProvider: JsonRpcProvider;

    readonly httpConfig: TxContractInteractionOptions;

    readonly logicContract: SimpleStorage;

    readonly relayContract: RelayContract;

    readonly srcDeployer: Wallet;

    readonly targetDeployer: Wallet;

    private max_mpt_depth: number;

    private min_mpt_depth: number;

    private initialValuesProof: GetProof;

    readonly differ: DiffHandler;

    private migrationState: Boolean;

    private keyList: String[];

    private proxyAddress: string;

    constructor(srcContract: SimpleStorage, logicContract: SimpleStorage, httpConfig: TxContractInteractionOptions, srcDeployer: Wallet, targetDeployer: Wallet, relayContract: RelayContract, srcProvider: JsonRpcProvider, targetProvider: JsonRpcProvider) {
        this.srcContract = srcContract;
        this.logicContract = logicContract;
        this.relayContract = relayContract;
        this.httpConfig = httpConfig;
        this.srcDeployer = srcDeployer;
        this.targetDeployer = targetDeployer;
        this.srcProvider = srcProvider;
        this.targetProvider = targetProvider;
        this.differ = new DiffHandler(this.srcProvider, this.targetProvider);
        this.migrationState = false;
        this.keyList = [];
        this.proxyAddress = 'undefined';

        logger.setSettings({ minLevel: 'debug', name: 'testchainproxy' });
    }

    getKeyList(): String[] {
        return this.keyList;
    }

    async initKeyList(list: String[]) {
        this.keyList = list;
        logger.debug('new key list set');
    }

    setProxyAddress(address: string) {
        this.proxyAddress = address;
    }

    getProxyAddress() {
        return this.proxyAddress;
    }

    async initializeProxyContract(wait?: number): Promise<InitializationResult> {
        let waitMiliseconds = 0;
        if (wait) {
            waitMiliseconds = wait * 1000;
        }
        logger.warn(`relay address is ${this.relayContract.address}`);
        logger.warn(`src address is ${this.srcContract.address}`);
        logger.warn(`logic address is ${this.logicContract.address}`);
        logger.warn(`Waiting ${waitMiliseconds / 1000} seconds for the proxy contract to be deployed`);

        const { keyList } = this;

        const latestBlock = await this.srcProvider.send('eth_getBlockByNumber', ['latest', true]);
        // create a proof of the source contract's storage
        this.initialValuesProof = new GetProof(await this.srcProvider.send('eth_getProof', [this.srcContract.address, keyList, latestBlock.number]));

        // getting depth of mpt
        this.max_mpt_depth = 0;
        this.initialValuesProof.storageProof.forEach((storageProof) => {
            if (this.max_mpt_depth < storageProof.proof.length) this.max_mpt_depth = storageProof.proof.length;
        });

        // getting min depth of mpt
        this.min_mpt_depth = this.max_mpt_depth;
        this.initialValuesProof.storageProof.forEach((storageProof) => {
            if (this.min_mpt_depth > storageProof.proof.length) this.min_mpt_depth = storageProof.proof.length;
        });

        await this.relayContract.addBlock(latestBlock.stateRoot, latestBlock.number);

        // Initialize or retrieve proxy contract

        logger.debug(`Compiling proxy with relay ${this.relayContract.address}, logic ${this.logicContract.address}, source ${this.srcContract.address}`);

        const compiledProxy = await ProxyContractBuilder.compiledAbiAndBytecode(this.relayContract.address, this.logicContract.address, this.srcContract.address);
        if (compiledProxy.error) {
            logger.error('Could not get the compiled proxy...');
            process.exit(-1);
        }

        const proxyFactory = new ethers.ContractFactory(PROXY_INTERFACE, compiledProxy.bytecode, this.targetDeployer);
        this.proxyContract = await proxyFactory.deploy();

        logger.debug('Updated proxy contract deployed at:', this.proxyContract.address);
        // migrate storage

        logger.debug('migrating storage');
        const proxykeys: Array<String> = [];
        const proxyValues: Array<String> = [];
        this.initialValuesProof.storageProof.forEach((storageProof) => {
            proxykeys.push(ethers.utils.hexZeroPad(storageProof.key, 32));
            proxyValues.push(ethers.utils.hexZeroPad(storageProof.value, 32));
        });
        const storageAdds: Promise<any>[] = [];
        storageAdds.push(this.proxyContract.addStorage(proxykeys, proxyValues, { gasLimit: this.httpConfig.gasLimit }));
        logger.warn('timeout is needed so new block is added to the chain, otherwise proof verification will fail');
        const waitToCompletion = await new Promise((resolve) => setTimeout(resolve, waitMiliseconds));
        try {
            await Promise.all([storageAdds, waitToCompletion]);
        } catch (e) {
            logger.error('Could not insert value in srcContract');
            logger.error(e);
            throw new Error(e as string);
        }
        logger.debug('done.');

        // validate migration
        //  getting account proof from source contract
        const sourceAccountProof = await this.initialValuesProof.optimizedProof(latestBlock.stateRoot, false);

        //  getting account proof from proxy contract
        const latestProxyChainBlock = await this.targetProvider.send('eth_getBlockByNumber', ['latest', false]);
        logger.debug(`Fetching proof with params ${this.proxyContract.address}, ${keyList}, ${latestBlock.number}`);
        const proxyChainProof = await this.targetProvider.send('eth_getProof', [this.proxyContract.address, keyList, latestProxyChainBlock.number]);
        const processedProxyChainProof = new GetProof(proxyChainProof);

        const proxyAccountProof = await processedProxyChainProof.optimizedProof(latestProxyChainBlock.stateRoot, false);
        logger.trace(`optimized proof: ${JSON.stringify(proxyAccountProof)}`);
        //  getting encoded block header
        const encodedBlockHeader = encodeBlockHeader(latestProxyChainBlock);
        try {
            const tx: ContractTransaction = await this.relayContract.verifyMigrateContract(sourceAccountProof, proxyAccountProof, encodedBlockHeader, this.proxyContract.address, ethers.BigNumber.from(latestProxyChainBlock.number).toNumber(), ethers.BigNumber.from(latestBlock.number).toNumber(), { gasLimit: this.httpConfig.gasLimit });
            const receipt = await tx.wait();
            logger.trace(receipt);

        //  validating
        await new Promise((resolve) => setTimeout(resolve, waitMiliseconds));
        const migrationValidated = await this.relayContract.getMigrationState(this.proxyContract.address);

        this.migrationState = migrationValidated;
        return {
            max_mpt_depth: this.max_mpt_depth,
            min_mpt_depth: this.min_mpt_depth,
            proxyContract: this.proxyContract,
            migrationState: migrationValidated,
            keys: this.keys,
            values: this.values,
            initialValuesProof: this.initialValuesProof,
            blockNumber: tx.blockNumber? ethers.BigNumber.from(tx.blockNumber).toNumber() : 0,    
        };
        } catch (error) {
            logger.error(`Error at migrating contract ${error}`);
            throw new Error(error as string);
        }

    }


    async dendrethSetAAndMigrateRaw(address: string, number: number): Promise<any> {
        let waitMiliseconds = 18000;
        logger.warn(`setting number to ${number} and waiting ${waitMiliseconds} miliseconds`);

         await this.srcContract.setA(number);
         await new Promise((resolve) => setTimeout(resolve, waitMiliseconds));        

        const { keyList } = this;

        const latestBlock = await this.srcProvider.send('eth_getBlockByNumber', ['latest', true]);
        logger.debug(`latest block number from the source: ${latestBlock.number}`);

        this.initialValuesProof = new GetProof(await this.srcProvider.send('eth_getProof', [this.srcContract.address, keyList, latestBlock.number]));

        // getting depth of mpt
        this.max_mpt_depth = 0;
        this.initialValuesProof.storageProof.forEach((storageProof) => {
            if (this.max_mpt_depth < storageProof.proof.length) this.max_mpt_depth = storageProof.proof.length;
        });

        // getting min depth of mpt
        this.min_mpt_depth = this.max_mpt_depth;
        this.initialValuesProof.storageProof.forEach((storageProof) => {
            if (this.min_mpt_depth > storageProof.proof.length) this.min_mpt_depth = storageProof.proof.length;
        });

        // await this.relayContract.addBlock(latestBlock.stateRoot, latestBlock.number);


        this.proxyContract = <ProxyContract>(
            new ethers.Contract(
                process.env.CONTRACT_TARGETCHAIN_PROXY as string || address,
                ContractArtifacts.abiProxyContract,
                ContractArtifacts.targetSigner,
            )
          );
        const proxykeys: Array<String> = [];
        const proxyValues: Array<String> = [];
        this.initialValuesProof.storageProof.forEach((storageProof) => {
            proxykeys.push(ethers.utils.hexZeroPad(storageProof.key, 32));
            proxyValues.push(ethers.utils.hexZeroPad(storageProof.value, 32));
        });
        const storageAdds: Promise<any>[] = [];
        storageAdds.push(this.proxyContract.addStorage(proxykeys, proxyValues, { gasLimit: this.httpConfig.gasLimit }));
        logger.warn('timeout is needed so new block is added to the chain, otherwise proof verification will fail');
        const waitToCompletion = await new Promise((resolve) => setTimeout(resolve, waitMiliseconds));
        try {
            await Promise.all([storageAdds, waitToCompletion]);
        } catch (e) {
            logger.error('Could not insert value in srcContract');
            logger.error(e);
            throw new Error(e as string);
        }
        logger.debug('done.');

        return {
            latestBlock: latestBlock.number,
            value: await this.srcContract.getA(),
        }

    }

    async dendrethVerifyMigration(latestSourceBlockNumber: string, root: string): Promise<InitializationResult> {
        let waitMiliseconds = 15000;
        logger.warn(`relay address is ${this.relayContract.address}`);
        logger.warn(`src address is ${this.srcContract.address}`);
        logger.warn(`logic address is ${this.logicContract.address}`);

        this.proxyContract = <ProxyContract>(
            new ethers.Contract(
                process.env.CONTRACT_TARGETCHAIN_PROXY as string,
                ContractArtifacts.abiProxyContract,
                ContractArtifacts.targetSigner,
            )
          );

        logger.warn(`proxy address is ${this.proxyContract.address}`);
        //const latestBlock = await this.srcProvider.send('eth_getBlockByNumber', [latestSourceBlockNumber, true]);
        const { keyList } = this;

    
        // validate migration
        //  getting account proof from source contract
        await this.relayContract.addBlock(root, latestSourceBlockNumber);
        const proof = new GetProof(await this.srcProvider.send('eth_getProof', [this.srcContract.address, keyList, latestSourceBlockNumber]));
        const optimizedProof = await proof.optimizedProof(root, false);

        const latestProxyChainBlock = await this.targetProvider.send('eth_getBlockByNumber', ['latest', false]);
        logger.debug(`Fetching proof with params ${this.proxyContract.address}, ${keyList}, ${latestSourceBlockNumber}`);
        const proxyChainProof = await this.targetProvider.send('eth_getProof', [this.proxyContract.address, keyList, latestProxyChainBlock.number]);
        const processedProxyChainProof = new GetProof(proxyChainProof);

        const proxyAccountProof = await processedProxyChainProof.optimizedProof(latestProxyChainBlock.stateRoot, false);
        logger.trace(`optimized proof: ${JSON.stringify(proxyAccountProof)}`);
        //  getting encoded block header
        const encodedBlockHeader = encodeBlockHeader(latestProxyChainBlock);
        try {
            const tx: ContractTransaction = await this.relayContract.verifyMigrateContract(optimizedProof, proxyAccountProof, encodedBlockHeader, this.proxyContract.address, ethers.BigNumber.from(latestProxyChainBlock.number).toNumber(), ethers.BigNumber.from(latestSourceBlockNumber).toNumber(), { gasLimit: this.httpConfig.gasLimit });
            const receipt = await tx.wait();
            logger.trace(receipt);

        //  validating
        await new Promise((resolve) => setTimeout(resolve, waitMiliseconds));
        const migrationValidated = await this.relayContract.getMigrationState(this.proxyContract.address);

        this.migrationState = migrationValidated;
        return {
            max_mpt_depth: this.max_mpt_depth,
            min_mpt_depth: this.min_mpt_depth,
            proxyContract: this.proxyContract,
            migrationState: migrationValidated,
            keys: this.keys,
            values: this.values,
            initialValuesProof: proof,
        };
        } catch (error) {
            logger.error(`Error at migrating contract ${error}`);
            throw new Error(error as string);
        }
    }

    async initiateMigrationWithDeployedProxy(address:string, wait?: number): Promise<InitializationResult> {
        let waitMiliseconds = 0;
        if (wait) {
            waitMiliseconds = wait * 1000;
        }
        logger.warn(`using address ${address} for proxy contract`);
        logger.warn(`Waiting ${waitMiliseconds / 1000} seconds for the proxy contract to be deployed`);

        const { keyList } = this;

        const latestBlock = await this.srcProvider.send('eth_getBlockByNumber', ['latest', true]);
        // create a proof of the source contract's storage
        this.initialValuesProof = new GetProof(await this.srcProvider.send('eth_getProof', [this.srcContract.address, keyList, latestBlock.number]));

        // getting depth of mpt
        this.max_mpt_depth = 0;
        this.initialValuesProof.storageProof.forEach((storageProof) => {
            if (this.max_mpt_depth < storageProof.proof.length) this.max_mpt_depth = storageProof.proof.length;
        });

        // getting min depth of mpt
        this.min_mpt_depth = this.max_mpt_depth;
        this.initialValuesProof.storageProof.forEach((storageProof) => {
            if (this.min_mpt_depth > storageProof.proof.length) this.min_mpt_depth = storageProof.proof.length;
        });
        let stateRoot = latestBlock.stateRoot;
        // let stateRoot = await this.relayContract.getStateRootDendreth();
        await this.relayContract.addBlock(stateRoot, latestBlock.number);

        this.proxyContract = <ProxyContract>(
            new ethers.Contract(
                address,
                ContractArtifacts.abiProxyContract,
                ContractArtifacts.targetSigner,
            )
          );
        // migrate storage

        // proofs should be different
        const lb = await this.targetProvider.send('eth_getBlockByNumber', ['latest', true]);
        logger.debug(`Fetching proof with params ${this.proxyContract.address}, ${keyList}, ${latestBlock.number}`);

        logger.debug('migrating storage');
        const proxykeys: Array<String> = [];
        const proxyValues: Array<String> = [];
        this.initialValuesProof.storageProof.forEach((storageProof) => {
            proxykeys.push(ethers.utils.hexZeroPad(storageProof.key, 32));
            proxyValues.push(ethers.utils.hexZeroPad(storageProof.value, 32));
        });
        const storageAdds: Promise<any>[] = [];
        storageAdds.push(this.proxyContract.addStorage(proxykeys, proxyValues, { gasLimit: this.httpConfig.gasLimit }));
        logger.warn('timeout is needed so new block is added to the chain, otherwise proof verification will fail');
        const waitToCompletion = await new Promise((resolve) => setTimeout(resolve, waitMiliseconds));
        try {
            await Promise.all([storageAdds, waitToCompletion]);
        } catch (e) {
            logger.error('Could not insert value in srcContract');
            logger.error(e);
            throw new Error(e as string);
        }
        logger.debug('done.');

        // validate migration
        //  getting account proof from source contract
        const sourceAccountProof = await this.initialValuesProof.optimizedProof(latestBlock.stateRoot, false);

        //  getting account proof from proxy contract
        const latestProxyChainBlock = await this.targetProvider.send('eth_getBlockByNumber', ['latest', true]);
        logger.debug(`Fetching proof with params ${this.proxyContract.address}, ${keyList}, ${latestBlock.number}`);
        const proxyChainProof = await this.targetProvider.send('eth_getProof', [this.proxyContract.address, keyList, latestProxyChainBlock.number]);
        const processedProxyChainProof = new GetProof(proxyChainProof);

        const proxyAccountProof = await processedProxyChainProof.optimizedProof(latestProxyChainBlock.stateRoot, false);
        logger.trace(`optimized proof: ${JSON.stringify(proxyAccountProof)}`);
        //  getting encoded block header
        const encodedBlockHeader = encodeBlockHeader(latestProxyChainBlock);
        try {
            const tx = await this.relayContract.verifyMigrateContract(sourceAccountProof, proxyAccountProof, encodedBlockHeader, this.proxyContract.address, ethers.BigNumber.from(latestProxyChainBlock.number).toNumber(), ethers.BigNumber.from(latestBlock.number).toNumber(), { gasLimit: this.httpConfig.gasLimit });
            const receipt = await tx.wait();
            logger.trace(receipt);
              //  validating
        await new Promise((resolve) => setTimeout(resolve, waitMiliseconds));
        const migrationValidated = await this.relayContract.getMigrationState(this.proxyContract.address);

        this.migrationState = migrationValidated;
        return {
            max_mpt_depth: this.max_mpt_depth,
            min_mpt_depth: this.min_mpt_depth,
            proxyContract: this.proxyContract,
            migrationState: migrationValidated,
            keys: this.keys,
            values: this.values,
            initialValuesProof: this.initialValuesProof,
            blockNumber: tx.blockNumber? ethers.BigNumber.from(tx.blockNumber).toNumber() : 0,    

        };
        } catch (error) {
            logger.error(`Error at migrating contract ${error}`);
            throw new Error(error as string);
        }

      
    }

    async setProxy(proxyAddress: string): Promise<void> {
        this.proxyContract = <ProxyContract> new ethers.Contract(
            proxyAddress,
            ContractArtifacts.abiProxyContract,
            ContractArtifacts.targetSigner,
        );
    }

    async changeValueAtMTHeight(mtHeight: number, max_value: number): Promise<Boolean> {
        if (!this.migrationState) {
            logger.error('Proxy contract is not initialized yet.');
            return false;
        } if (mtHeight > this.max_mpt_depth || mtHeight < this.min_mpt_depth) {
            logger.error(`mtHeight ${mtHeight} is not in the range of: ${this.min_mpt_depth} <= ${mtHeight} <= ${this.max_mpt_depth}`);
            return false;
        }

        // get representing value for mpt height
        const proofIndex = this.initialValuesProof.storageProof.findIndex((storageProof) => storageProof.proof.length === mtHeight);
        const valueIndex = this.values.findIndex((value) => ethers.BigNumber.from(this.initialValuesProof.storageProof[proofIndex].value).toHexString() === ethers.BigNumber.from(value).toHexString());

        // change previous synced value
        const value = Math.floor(Math.random() * max_value);
        await this.srcContract.insert(valueIndex, value);
        return true;
    }

    async addValueAtIndex(valueIndex: number, max_value: number): Promise<ChangeValueAtIndexResult> {
        if (!this.migrationState) {
            logger.error('Proxy contract is not initialized yet.');
            return { success: false };
        }
        const value = Math.floor(Math.random() * max_value);
        await this.srcContract.insert(valueIndex, value);
        return {
            newValue: value,
            success: true,
        };
    }

    async changeValueAtIndex(valueIndex: number, max_value: number): Promise<ChangeValueAtIndexResult> {
        if (!this.migrationState) {
            logger.error('Proxy contract is not initialized yet.');
            return { success: false };
        }
        if (this.keys.findIndex((key) => key === valueIndex) < 0) {
            logger.error(`Index ${valueIndex} does not exist on srcContract`);
            return { success: false };
        }
        const value = Math.floor(Math.random() * max_value);
        await this.srcContract.insert(valueIndex, value);
        return {
            newValue: value,
            success: true,
        };
    }

    async setA(num: number) {
        await this.srcContract.setA(num);
    }

    async migrateChangesToProxy(changedKeys: Array<BigNumberish>, isDeployed?: boolean, wait?: number, address?: string): Promise<MigrationResult> {
        const state = this.migrationState;
        if (!state && !isDeployed) {
            logger.error('Proxy contract is not initialized yet.');
            return { migrationResult: false };
        }
        let waitMiliseconds = 5000;
        if (wait) {
            waitMiliseconds = wait * 1000;
        }
        logger.warn(`Waiting ${waitMiliseconds / 1000} seconds for the block to be added`);

        if (changedKeys.length < 1) {
            return {
                migrationResult: true,
                receipt: {
                    gasUsed: ethers.BigNumber.from(0),
                },
            };
        }
        if (!this.proxyContract && address)    {
            this.proxyContract = <ProxyContract>(
                new ethers.Contract(
                    address as string,
                    ContractArtifacts.abiProxyContract,
                    ContractArtifacts.targetSigner,
                )
              );
        }

        const latestBlock = await this.srcProvider.send('eth_getBlockByNumber', ['latest', true]);

        // create a proof of the source contract's storage for all the changed keys
        const changedKeysProof = new GetProof(await this.srcProvider.send('eth_getProof', [this.srcContract.address, this.keyList, latestBlock.number]));

        // get depth of value
        let maxValueMptDept = 0;
        changedKeysProof.storageProof.forEach((storageProof) => {
            if (maxValueMptDept < storageProof.proof.length) maxValueMptDept = storageProof.proof.length;
        });

        const rlpProof = await changedKeysProof.optimizedProof(latestBlock.stateRoot, false);
        await this.relayContract.addBlock(latestBlock.stateRoot, latestBlock.number);
        await new Promise((resolve) => setTimeout(resolve, waitMiliseconds));

        // update the proxy storage
        let txResponse;
        let receipt;
        try {
            txResponse = await this.proxyContract.updateStorage(rlpProof, { gasLimit: this.httpConfig.gasLimit });
            receipt = await txResponse.wait();
        } catch (e: any) {
            logger.error('something went wrong');
            const regexr = /Reverted 0x(.*)/;
            const checker = regexr.exec(e.data);
            if (checker) {
                logger.error(`'${hexToAscii(checker[1])}'`);
                logger.fatal(e);
            } else throw new Error(e as string);
            return { migrationResult: false };
        }

        return {
            receipt,
            maxValueMptDept,
            migrationResult: true,
            proofs: changedKeysProof,
        };
    }
}
