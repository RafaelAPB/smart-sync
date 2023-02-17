import { Contract } from '@ethersproject/contracts';
import { JsonRpcProvider } from '@ethersproject/providers';
import {
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
        logger.setSettings({ minLevel: 'debug', name: 'testchainproxy' });
    }

    async initKeyList(list: String[]) {
        this.keyList = list;
        logger.debug('new key list set');
    }

    async initializeProxyContract(): Promise<InitializationResult> {
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


        // logger.debug(`Compiling proxy with relay ${this.relayContract.address}, logic ${this.logicContract.address}, source ${this.srcContract.address}`);

        const compiledProxy = await ProxyContractBuilder.compiledAbiAndBytecode(this.relayContract.address, this.logicContract.address, this.srcContract.address);
        if (compiledProxy.error) {
            logger.error('Could not get the compiled proxy...');
            process.exit(-1);
        }

        const proxyFactory = new ethers.ContractFactory(PROXY_INTERFACE, compiledProxy.bytecode, this.targetDeployer);
        this.proxyContract = await proxyFactory.deploy();

        // this.proxyContract = <ProxyContract> new ethers.Contract(
        //     CONTRACT_TARGETCHAIN_PROXY as string,
        //     ContractArtifacts.abiProxyContract,
        //     ContractArtifacts.targetSigner,
        // );

        
        logger.debug('Updated proxy contract deployed at:', this.proxyContract.address);
        // migrate storage
       
        // proofs should be different
        const lb = await this.targetProvider.send('eth_getBlockByNumber', ['latest', true]);
        logger.debug(`Fetching proof with params ${this.proxyContract.address}, ${keyList}, ${latestBlock.number}`);
        const pp = await this.targetProvider.send('eth_getProof', [this.proxyContract.address, keyList, lb.number]);
        
       
        logger.debug('migrating storage');
        const proxykeys: Array<String> = [];
        const proxyValues: Array<String> = [];
        this.initialValuesProof.storageProof.forEach((storageProof) => {
            proxykeys.push(ethers.utils.hexZeroPad(storageProof.key, 32));
            proxyValues.push(ethers.utils.hexZeroPad(storageProof.value, 32));
        });
        const storageAdds: Promise<any>[] = [];
        storageAdds.push(this.proxyContract.addStorage(proxykeys, proxyValues, { gasLimit: this.httpConfig.gasLimit }));
        const waitToCompletion =  await new Promise((resolve) => setTimeout(resolve, 20000));
        try {
            await Promise.all([storageAdds,waitToCompletion]);
        } catch (e) {
            logger.error('Could not insert value in srcContract');
            logger.error(e);
            process.exit(-1);
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

        //  getting encoded block header
        const encodedBlockHeader = encodeBlockHeader(latestProxyChainBlock);
        try {
            const tx = await this.relayContract.verifyMigrateContract(sourceAccountProof, proxyAccountProof, encodedBlockHeader, this.proxyContract.address, ethers.BigNumber.from(latestProxyChainBlock.number).toNumber(), ethers.BigNumber.from(latestBlock.number).toNumber(), { gasLimit: this.httpConfig.gasLimit });
            const receipt = await tx.wait();
            logger.trace(receipt);

        } catch (error) {
            logger.error(`Error at migrating contract ${error}`);
            process.exit(-1);
        }
        
        //  validating
        await new Promise((resolve) => setTimeout(resolve, 20000));
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
        };
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

    async migrateChangesToProxy(changedKeys: Array<BigNumberish>, isDeployed?: boolean): Promise<MigrationResult> {
        if (!this.migrationState && !isDeployed) {
            logger.error('Proxy contract is not initialized yet.');
            return { migrationResult: false };
        }

        if (changedKeys.length < 1) {
            return {
                migrationResult: true,
                receipt: {
                    gasUsed: ethers.BigNumber.from(0),
                },
            };
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
        // update the proxy storage
        let txResponse;
        let receipt;
        try {
            txResponse = await this.proxyContract.updateStorage(rlpProof, latestBlock.number, { gasLimit: this.httpConfig.gasLimit });
            receipt = await txResponse.wait();
        } catch (e: any) {
            logger.error('something went wrong');
            const regexr = /Reverted 0x(.*)/;
            const checker = regexr.exec(e.data);
            if (checker) {
                logger.error(`'${hexToAscii(checker[1])}'`);
                logger.fatal(e);
            } else logger.fatal(e);
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
