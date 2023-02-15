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
    DEPLOYED_CONTRACT_ADDRESS_PROXY_GOERLI, DEPLOYED_CONTRACT_ADDRESS_STORAGE_GOERLI_LOGIC_CONTRACT, DEPLOYED_CONTRACT_ADDRESS_STORAGE_MUMBAI, DEPLOYED_CONTRACT_ADDRESS_RELAY_GOERLI,
} = process.env;
const differ = new DiffHandler(ContractArtifacts.mumbaiProvider, ContractArtifacts.goerliProvider);
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
    const logicContractSimpleStorageGoerli = <SimpleStorage> new ethers.Contract(
        DEPLOYED_CONTRACT_ADDRESS_STORAGE_GOERLI_LOGIC_CONTRACT as string,
        ContractArtifacts.abiSimpleStorage,
        ContractArtifacts.goerliSigner,
    );
    
    // value from the source chain is relevant as we are replicating it
    const srcContractSimpleStoragePolygon = <SimpleStorage> new ethers.Contract(
        DEPLOYED_CONTRACT_ADDRESS_STORAGE_MUMBAI as string,
        ContractArtifacts.abiSimpleStorage,
        ContractArtifacts.mumbaiSigner,
    );
    const value = await srcContractSimpleStoragePolygon.getA();
    logger.debug('Value of logic source contract is:', value);
    
    // first number from simple storage smart contract
    const paddedSlot = ethers.utils.hexZeroPad('0x00', 32);
    const keyList = [paddedSlot];

    const relayGoerli = <RelayContract> new ethers.Contract(
        DEPLOYED_CONTRACT_ADDRESS_RELAY_GOERLI as string,
        ContractArtifacts.abiRelay,
        ContractArtifacts.goerliSigner,
    );

    logger.info(`Using relay contract deployed at ${relayGoerli.address}`);
    // STEP: Deploy / Retrieve Secondary Contract (State Proxy) //

    const chainProxy = new TestChainProxySimpleStorage(
        srcContractSimpleStoragePolygon,
        logicContractSimpleStorageGoerli,
        chainConfigs,
        ContractArtifacts.mumbaiSigner,
        ContractArtifacts.goerliSigner,
        relayGoerli,
        ContractArtifacts.mumbaiProvider,
        ContractArtifacts.goerliProvider,
    );

    chainProxy.initKeyList(keyList);

    logger.debug(`srcContractAddress: ${srcContractSimpleStoragePolygon.address}, relayContract: ${relayGoerli.address}`);

    // Initialize or retrieve proxy contract
    const proxyContract = <ProxyContract> new ethers.Contract(
        DEPLOYED_CONTRACT_ADDRESS_PROXY_GOERLI as string,
        ContractArtifacts.abiProxyContract,
        ContractArtifacts.goerliSigner,
    );

    await chainProxy.setA(3);
    const tempDiff = await differ.getDiffFromStorage(srcContractSimpleStoragePolygon.address, proxyContract.address, 'latest', 'latest', keyList[0], keyList[0]);
    logger.debug(`tempDiff: ${JSON.stringify(tempDiff)}`);



    const initialization = await chainProxy.initializeProxyContract();
    if (!initialization) {
        throw new Error();
    }
    expect(initialization.migrationState).to.be.true;

    // after update storage layouts are equal, no diffs
    const diffFinal = await differ.getDiffFromStorage(srcContractSimpleStoragePolygon.address, initialization.proxyContract.address, 'latest', 'latest', keyList[0], keyList[0]);
    logger.debug(`diffFinal: ${JSON.stringify(diffFinal)}`);
    expect(diffFinal.isEmpty()).to.be.true;
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        logger.error(error);
        process.exit(1);
    });
