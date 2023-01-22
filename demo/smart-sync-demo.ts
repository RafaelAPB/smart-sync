/* eslint-disable @typescript-eslint/no-unused-expressions */
import { expect } from 'chai';
import { ethers } from 'ethers';
import path from 'path';
import { RelayContract } from '../src-gen/types';
import { SimpleStorage } from '../src-gen/types/SimpleStorage';
import { encodeBlockHeader } from '../src/chain-proxy';
import { TxContractInteractionOptions } from '../src/cli/smart-sync';
import DiffHandler from '../src/diffHandler/DiffHandler';
import GetProof from '../src/proofHandler/GetProof';
import FileHandler from '../src/utils/fileHandler';
import { logger } from '../src/utils/logger';
import { TestChainProxy, verifyEthGetProof } from '../test/test-utils';
import {
    ContractArtifacts,
} from './utils/artifacts';
import { updateProxyContract } from './utils/initialize-contracts';
import { TestChainProxySimpleStorage } from './utils/test-chain-proxy-simple-storage';

require('dotenv').config();

logger.setSettings({ minLevel: 'info', name: 'demo' });

const {
    PRIVATE_KEY, DEPLOYED_CONTRACT_ADDRESS_STORAGE_GOERLI_LOGIC_CONTRACT, DEPLOYED_CONTRACT_ADDRESS_PROXY_GOERLI, DEPLOYED_CONTRACT_ADDRESS_STORAGE_GOERLI_SRC_CONTRACT, DEPLOYED_CONTRACT_ADDRESS_STORAGE_MUMBAI, RPC_URL_GOERLI, RPC_URL_MUMBAI, GAS_LIMIT, RPC_LOCALHOST_ORIGIN, RPC_LOCALHOST_TARGET, DEPLOYED_CONTRACT_ADDRESS_RELAY_GOERLI, DEPLOYED_CONTRACT_ADDRESS_SRC_CONTRACT_SYNC_CANDIDATE, DEPLOYED_CONTRACT_ADDRESS_LOGIC_CONTRACT_SYNC_CANDIDATE,
} = process.env;

const goerliProvider = new ethers.providers.JsonRpcProvider(RPC_URL_GOERLI);
const polygonProvider = new ethers.providers.JsonRpcProvider(RPC_URL_MUMBAI);

const goerliSigner = new ethers.Wallet(PRIVATE_KEY as string, goerliProvider);
const polygonSigner = new ethers.Wallet(PRIVATE_KEY as string, polygonProvider);
const MAX_VALUE = 1000000;

const differ = new DiffHandler(polygonProvider, goerliProvider);
const configPath = path.join(__dirname, './config/demo-config.json');
async function main() {
    const fh = new FileHandler(configPath);
    const chainConfigs = fh.getJSON<TxContractInteractionOptions>();
    if (!chainConfigs) {
        logger.error(`No config available under ${configPath}`);
        process.exit(-1);
    }
    // STEP: Deploy/Retrieve Base Contracts //

    // Base contracts SyncCandidate
    // const srcContract = new ethers.Contract(
    //     DEPLOYED_CONTRACT_ADDRESS_SRC_CONTRACT_SYNC_CANDIDATE as string,
    //     abiSyncCandidate,
    //     goerliSigner,
    // );
    // logger.info(`Using srcAddress deployed at ${srcContract.address}`);

    // const logicContract = new ethers.Contract(
    //     DEPLOYED_CONTRACT_ADDRESS_LOGIC_CONTRACT_SYNC_CANDIDATE as string,
    //     abiSyncCandidate,
    //     goerliSigner,
    // );
    // logger.info(`Using logicContract deployed at ${logicContract.address}`);

    // Base contracts are simple storage contracts
  
    // Base contracts are simple storage contracts
    const logicContractSimpleStorageGoerli = new ethers.Contract(
        DEPLOYED_CONTRACT_ADDRESS_STORAGE_GOERLI_LOGIC_CONTRACT as string,
        ContractArtifacts.abiSimpleStorage,
        goerliSigner,
    );

    const srcContractSimpleStoragePolygon = new ethers.Contract(
        DEPLOYED_CONTRACT_ADDRESS_STORAGE_MUMBAI as string,
        ContractArtifacts.abiSimpleStorage,
        polygonSigner,
    );
    // first number from simple storage smart contract
    const paddedSlot = ethers.utils.hexZeroPad('0x00', 32);
    const keyList = [paddedSlot];
  
    const relayGoerli = new ethers.Contract(
        DEPLOYED_CONTRACT_ADDRESS_RELAY_GOERLI as string,
        ContractArtifacts.abiRelay,
        goerliSigner,
    );
    logger.info(`Using relay contract deployed at ${relayGoerli.address}`);
    // STEP: Deploy / Retrieve Secondary Contract (State Proxy) //

    const chainProxy = new TestChainProxySimpleStorage(
        srcContractSimpleStoragePolygon as SimpleStorage,
        logicContractSimpleStorageGoerli as SimpleStorage,
        chainConfigs,
        polygonSigner,
        goerliSigner,
        relayGoerli as RelayContract,
        polygonProvider,
        goerliProvider,
    );

    chainProxy.initKeyList(keyList);

    logger.debug(`srcContractAddress: ${srcContractSimpleStoragePolygon.address}, relayContract: ${relayGoerli.address}`);
    const initialization = await chainProxy.initializeProxyContract();
    if (!initialization) {
        throw new Error();
    }
    expect(initialization.migrationState).to.be.true;

    // The storage diff between `srcContract` and `proxyContract` comes up empty: both storage layouts are the same
    const diff = await differ.getDiffFromStorage(srcContractSimpleStoragePolygon.address, initialization.proxyContract.address);
    expect(diff.isEmpty()).to.be.true;

    // change all the previous synced values
    await chainProxy.setA(0);

    // get changed keys
    const diffAfer = await differ.getDiffFromStorage(srcContractSimpleStoragePolygon.address, initialization.proxyContract.address);
    const changedKeys = diffAfer.getKeys();

    // migrate changes to proxy contract
    const migrationResult = await chainProxy.migrateChangesToProxy(changedKeys);
    expect(migrationResult.migrationResult).to.be.true;
    if (!migrationResult.receipt) {
        logger.fatal('No receipt provided');
        process.exit(-1);
    }
    logger.info('Gas used for updating 1 value in map with 1 value: ', migrationResult.receipt.gasUsed.toNumber());

    // after update storage layouts are equal, no diffs
    const diffFinal = await differ.getDiffFromStorage(srcContractSimpleStoragePolygon.address, initialization.proxyContract.address);
    expect(diffFinal.isEmpty()).to.be.true;
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        logger.error(error);
        process.exit(1);
    });
