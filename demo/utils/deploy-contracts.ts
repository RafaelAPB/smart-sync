/* eslint-disable global-require */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { expect } from 'chai';
import { Contract, ethers } from 'ethers';
import { PROXY_INTERFACE } from '../../src/config';
import { logger } from '../../src/utils/logger';
import ProxyContractBuilder from '../../src/utils/proxy-contract-builder';
import { ContractArtifacts } from './artifacts';
require('dotenv').config();

const {
     DEPLOYED_CONTRACT_ADDRESS_STORAGE_MUMBAI,  CONTRACT_TARGETCHAIN_LOGIC,CONTRACT_TARGETCHAIN_RELAY,CONTRACT_SOURCECHAIN_SOURCE, DEPLOYED_CONTRACT_ADDRESS_RELAY_GOERLI, DEPLOYED_CONTRACT_ADDRESS_STORAGE_GOERLI_SRC_CONTRACT
} = process.env;



logger.setSettings({ minLevel: 'info', name: 'demo-utils:deploy-contracts' });


async function deploySimpleStorageSource() {
    logger.info(`Deploying Simple Storage ${ContractArtifacts.source}`);
    try {
        const SimpleStorageContract = await ContractArtifacts.SimpleStorageSource.deploy();
        await SimpleStorageContract.deployed();
        logger.info(`Contract SimpleStorageContract deployed at: ${SimpleStorageContract.address}}`);
    } catch (error) {
        logger.error(error);
    }
}

async function deploySimpleStorageTarget() {
    logger.info(`Deploying Simple Storage ${ContractArtifacts.target}`);
    try {
        const SimpleStorageContract = await ContractArtifacts.SimpleStorageTarget.deploy();
        await SimpleStorageContract.deployed();
        logger.info(`Contract SimpleStorageContract deployed at: ${SimpleStorageContract.address}}`);
    } catch (error) {
        logger.error(error);
    }
}

async function deployRLPReader() {
    try {
        logger.info(`Deploying RLP Reader ${ContractArtifacts.target}`);
        const RLPReaderContract = await ContractArtifacts.RLPReaderTarget.deploy();
        await RLPReaderContract.deployed();
        logger.info(`Contract RLPReaderContract deployed at: ${RLPReaderContract.address}`);
    } catch (error) {
        logger.error(error);
    }
}
async function deployMapping() {
    try {
        logger.info(`Deploying Mapping ${ContractArtifacts.target}`);
        const mapperContract = await ContractArtifacts.MapperTarget.deploy();
        await mapperContract.deployed();
        logger.info(`Contract mapperContract deployed at: ${mapperContract.address}`);
    } catch (error) {
        logger.error(error);
    }
}

async function deployRelay() {
    try {
        logger.info(`Deploying Relay ${ContractArtifacts.target}`);
        const RelayContract = await ContractArtifacts.RelayTarget.deploy();
        await RelayContract.deployed();
        logger.info(`Contract Relay deployed at: ${RelayContract.address}`);
    } catch (error) {
        logger.error(error);
    }
}

async function deploySyncCandidate() {
    try {
        logger.info(`Deploying SyncCandidate ${ContractArtifacts.target}`);
        const SyncCandidateContract = await ContractArtifacts.SyncCandidateTarget.deploy();
        await SyncCandidateContract.deployed();
        logger.info(`Contract SyncCandidate deployed at: ${SyncCandidateContract.address}`);
    } catch (error) {
        logger.error(error);
    }
}

async function compileAndDeployProxyContractTarget(): Promise<Contract | undefined> {
    try {
        logger.info('Compiling ProxyContract');
        // DEPLOYED_CONTRACT_ADDRESS_LOGIC_CONTRACT_SYNC_CANDIDATE and DEPLOYED_CONTRACT_ADDRESS_SRC_CONTRACT_SYNC_CANDIDATE could be used
        if (!CONTRACT_SOURCECHAIN_SOURCE || !CONTRACT_TARGETCHAIN_RELAY || !CONTRACT_TARGETCHAIN_LOGIC) {
            throw new Error('Contracts need to be deployed and set up in the .env file');
        }
        const compiledProxy = await ProxyContractBuilder.compiledAbiAndBytecode(CONTRACT_TARGETCHAIN_RELAY, CONTRACT_TARGETCHAIN_LOGIC, CONTRACT_SOURCECHAIN_SOURCE);
        if (compiledProxy.error) {
            throw Error('Could not compile proxy');
        }
        logger.info(`Deploying Proxy ${ContractArtifacts.target} instantiated with Relay: ${CONTRACT_TARGETCHAIN_RELAY}, Source address: ${CONTRACT_SOURCECHAIN_SOURCE}, logic address: ${CONTRACT_TARGETCHAIN_LOGIC}`);
        const proxyFactory = new ethers.ContractFactory(PROXY_INTERFACE, compiledProxy.bytecode, ContractArtifacts.targetSigner);
        const proxyContract: Contract = await proxyFactory.deploy();
        logger.info(`Contract ProxyContract deployed at: ${proxyContract.address}`);
        return proxyContract || undefined;
    } catch (error) {
        logger.error(error);
        return undefined;
    }
}

async function main() {

    await deployRelay();
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        logger.error(error);
        process.exit(1);
    });
