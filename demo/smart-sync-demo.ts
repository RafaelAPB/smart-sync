/* eslint-disable @typescript-eslint/no-unused-expressions */
import { expect } from 'chai';
import { ethers } from 'ethers';
import path from 'path';
import { ProxyContract, RelayContract } from '../src-gen/types';
import { SimpleStorage } from '../src-gen/types/SimpleStorage';
import { TxContractInteractionOptions } from '../src/cli/smart-sync';
import DiffHandler from '../src/diffHandler/DiffHandler';
import FileHandler from '../src/utils/fileHandler';
import { logger } from '../src/utils/logger';
import {
    ContractArtifacts,
} from './utils/artifacts';
import { TestChainProxySimpleStorage } from './utils/test-chain-proxy-simple-storage';

require('dotenv').config();

logger.setSettings({ minLevel: 'debug', name: 'demo' });

const {
    CONTRACT_TARGETCHAIN_PROXY, CONTRACT_SOURCECHAIN_SOURCE, CONTRACT_TARGETCHAIN_LOGIC, CONTRACT_TARGETCHAIN_RELAY, DEPLOYED_CONTRACT_ADDRESS_RELAY_GOERLI,
} = process.env;
const differ = new DiffHandler(ContractArtifacts.sourceProvider, ContractArtifacts.targetProvider);
const configPath = path.join(__dirname, './config/demo-config.json');

async function main() {
    const fh = new FileHandler(configPath);
    const chainConfigs = fh.getJSON<TxContractInteractionOptions>();
    if (!chainConfigs) {
        logger.error(`No config available under ${configPath}`);
        process.exit(-1);
    }
    // STEP: Deploy/Retrieve Base Contracts //
    logger.warn('Do not forget to change demo-config.json if src or target chains change');

    // no need to check value from the logic contract (target chain), because only the proxy is updated
    const contractSourceChainSource = <SimpleStorage> new ethers.Contract(
        CONTRACT_SOURCECHAIN_SOURCE as string,
        ContractArtifacts.abiSimpleStorage,
        ContractArtifacts.sourceSigner,
    );

    // value from the source chain is relevant as we are replicating it
    const contractTargetChainLogic = <SimpleStorage> new ethers.Contract(
        CONTRACT_TARGETCHAIN_LOGIC as string,
        ContractArtifacts.abiSimpleStorage,
        ContractArtifacts.targetSigner,
    );

    // should be 0 by default, but after first iteration will change
    const value = await contractSourceChainSource.getA();
    logger.debug('Value of logic source contract is:', value);

    // first number from simple storage smart contract
    const paddedSlot = ethers.utils.hexZeroPad('0x00', 32);
    const keyList = [paddedSlot];

    const contractTargetChainRelay = <RelayContract> new ethers.Contract(
        CONTRACT_TARGETCHAIN_RELAY as string,
        ContractArtifacts.abiRelay,
        ContractArtifacts.targetSigner,
    );

    logger.info(`Using relay contract deployed at ${contractTargetChainRelay.address}`);
    // STEP: Deploy / Retrieve Secondary Contract (State Proxy) //

    const chainProxy = new TestChainProxySimpleStorage(
        contractSourceChainSource,
        contractTargetChainLogic,
        chainConfigs,
        ContractArtifacts.sourceSigner,
        ContractArtifacts.targetSigner,
        contractTargetChainRelay,
        ContractArtifacts.sourceProvider,
        ContractArtifacts.targetProvider,
    );

    chainProxy.initKeyList(keyList);

    const originalDiff = await differ.getDiffFromStorage(contractSourceChainSource.address, CONTRACT_TARGETCHAIN_PROXY, 'latest', 'latest', keyList[0], keyList[0]);
    logger.debug(`originalDiff src logic x proxy before set A: ${JSON.stringify(originalDiff)}`);

    const randomValue = Math.floor(Math.random() * 1000);
    logger.debug(`Setting A from logic contract to: ${randomValue}`);
    await chainProxy.setA(randomValue);
        // wait until new value of A is committed
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const tempDiff = await differ.getDiffFromStorage(contractSourceChainSource.address, CONTRACT_TARGETCHAIN_PROXY, 'latest', 'latest', keyList[0], keyList[0]);
    logger.debug(`tempDiff src logic x proxy after set A: ${JSON.stringify(tempDiff)}`);
    expect(tempDiff.isEmpty()).to.be.false;

    const initialization = await chainProxy.initializeProxyContract(35);
    if (!initialization) {
        throw new Error();
    }
    expect(initialization.migrationState).to.be.true;

    // after update storage layouts are equal, no diffs
    const diffFinal = await differ.getDiffFromStorage(contractSourceChainSource.address, initialization.proxyContract.address, 'latest', 'latest', keyList[0], keyList[0]);
    logger.debug(`diffFinal: ${JSON.stringify(diffFinal)}`);
    //while diff is not empty, wait x seconds (instead of 25s above)
    //expect(diffFinal.isEmpty()).to.be.true;

    logger.warn("start update migration phase");

    logger.debug(`Setting A from logic contract to: ${randomValue}`);
    await chainProxy.setA(randomValue as number + 1);
    await new Promise((resolve) => setTimeout(resolve, 20000));
    const diffMigration = await differ.getDiffFromStorage(contractSourceChainSource.address, initialization.proxyContract.address, 'latest', 'latest', keyList[0], keyList[0]);
    logger.debug(`diffFinal: ${JSON.stringify(diffFinal)}`);
    await chainProxy.migrateChangesToProxy(keyList, true, 20);
    const diffMigrationFinal = await differ.getDiffFromStorage(contractSourceChainSource.address, initialization.proxyContract.address, 'latest', 'latest', keyList[0], keyList[0]);
    logger.debug(`diffFinal: ${JSON.stringify(diffFinal)}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        logger.error(error);
        process.exit(1);
    });
