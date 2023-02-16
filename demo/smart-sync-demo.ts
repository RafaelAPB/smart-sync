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
        ContractArtifacts.goerliProvider,
        ContractArtifacts.mumbaiProvider,
    );

    chainProxy.initKeyList(keyList);

    // await chainProxy.setA(1337);
    // await new Promise((resolve) => setTimeout(resolve, 10000));

    logger.debug(`srcContractAddress: ${contractSourceChainSource.address}, relayContract: ${contractTargetChainRelay.address}`);

    // should be 1337 or 3

    const tempDiff = await differ.getDiffFromStorage(contractSourceChainSource.address, contractTargetChainLogic.address, 'latest', 'latest', keyList[0], keyList[0]);
    logger.debug(`tempDiff src logic: ${JSON.stringify(tempDiff)}`);

    const initialization = await chainProxy.initializeProxyContract();
    if (!initialization) {
        throw new Error();
    }
    expect(initialization.migrationState).to.be.true;

    // after update storage layouts are equal, no diffs
    const diffFinal = await differ.getDiffFromStorage(contractSourceChainSource.address, initialization.proxyContract.address, 'latest', 'latest', keyList[0], keyList[0]);
    logger.debug(`diffFinal: ${JSON.stringify(diffFinal)}`);
    expect(diffFinal.isEmpty()).to.be.true;
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        logger.error(error);
        process.exit(1);
    });
