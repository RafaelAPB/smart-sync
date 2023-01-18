/* eslint-disable global-require */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { expect } from 'chai';
import { Contract, ethers } from 'ethers';
import { PROXY_INTERFACE } from '../../src/config';
import { logger } from '../../src/utils/logger';
import ProxyContractBuilder from '../../src/utils/proxy-contract-builder';

require('dotenv').config();

logger.setSettings({ minLevel: 'info', name: 'demo-utils:deploy-contracts' });

const {
    PRIVATE_KEY, RPC_URL_GOERLI, RPC_URL_MUMBAI, DEPLOYED_CONTRACT_ADDRESS_STORAGE_MUMBAI, RPC_LOCALHOST_ORIGIN, RPC_LOCALHOST_TARGET, DEPLOYED_CONTRACT_ADDRESS_RELAY_GOERLI, DEPLOYED_CONTRACT_ADDRESS_SRC_CONTRACT_SYNC_CANDIDATE, DEPLOYED_CONTRACT_ADDRESS_LOGIC_CONTRACT_SYNC_CANDIDATE,
} = process.env;

const goerliProvider = new ethers.providers.JsonRpcProvider(RPC_URL_GOERLI);
const polygonProvider = new ethers.providers.JsonRpcProvider(RPC_URL_MUMBAI);

const goerliSigner = new ethers.Wallet(PRIVATE_KEY as string, goerliProvider);
const polygonSigner = new ethers.Wallet(PRIVATE_KEY as string, polygonProvider);

export const abiSimpleStorage = require('../../artifacts/contracts/SimpleStorage.sol/SimpleStorage.json').abi;
export const bytecodeSimpleStorage = require('../../artifacts/contracts/SimpleStorage.sol/SimpleStorage.json').bytecode;

const SimpleStorage = new ethers.ContractFactory(abiSimpleStorage, bytecodeSimpleStorage, goerliSigner);

const abiRLPReader = require('../../artifacts/contracts/RLPReader.sol/RLPReader.json').abi;
const bytecodeRLPReader = require('../../artifacts/contracts/RLPReader.sol/RLPReader.json').bytecode;

const RLPReader = new ethers.ContractFactory(abiRLPReader, bytecodeRLPReader, goerliSigner);

export const abiRelay = require('../../artifacts/contracts/RelayContract.sol/RelayContract.json').abi;
export const bytecodeRelay = require('../../artifacts/contracts/RelayContract.sol/RelayContract.json').bytecode;

const Relay = new ethers.ContractFactory(abiRelay, bytecodeRelay, goerliSigner);

const abiMapping = require('../../artifacts/contracts/MappingContract.sol/MappingContract.json').abi;
const bytecodeMapping = require('../../artifacts/contracts/MappingContract.sol/MappingContract.json').bytecode;

const Mapper = new ethers.ContractFactory(abiMapping, bytecodeMapping, goerliSigner);

export const abiSyncCandidate = require('../../artifacts/contracts/SyncCandidate.sol/SyncCandidate.json').abi;
export const bytecodeSyncCandidate = require('../../artifacts/contracts/SyncCandidate.sol/SyncCandidate.json').bytecode;

const SyncCandidate = new ethers.ContractFactory(abiSyncCandidate, bytecodeSyncCandidate, goerliSigner);

export const abiProxyContract = require('../../artifacts/contracts/ProxyContract.sol/ProxyContract.json').abi;
export const bytecodeProxyContract = require('../../artifacts/contracts/ProxyContract.sol/ProxyContract.json').bytecode;

const ProxyContract = new ethers.ContractFactory(abiProxyContract, bytecodeProxyContract, goerliSigner);

async function deploySimpleStorage() {
    logger.info('Deploying Simple Storage on Goerli');
    try {
        const SimpleStorageContract = await SimpleStorage.deploy();
        await SimpleStorageContract.deployed();
        logger.info(`Contract SimpleStorageContract deployed at: ${SimpleStorageContract.address}}`);
    } catch (error) {
        logger.error(error);
    }
}

async function deployRLPReader() {
    try {
        logger.info('Deploying RLP Reader on Goerli');
        const RLPReaderContract = await RLPReader.deploy();
        await RLPReaderContract.deployed();
        logger.info(`Contract RLPReaderContract deployed at: ${RLPReaderContract.address}`);
    } catch (error) {
        logger.error(error);
    }
}
async function deployMapping() {
    try {
        logger.info('Deploying Mapping on Goerli');
        const mapperContract = await Mapper.deploy();
        await mapperContract.deployed();
        logger.info(`Contract mapperContract deployed at: ${mapperContract.address}`);
    } catch (error) {
        logger.error(error);
    }
}

async function deployRelay() {
    try {
        logger.info('Deploying Relay on Goerli');
        const RelayContract = await Relay.deploy();
        await RelayContract.deployed();
        logger.info(`Contract Relay deployed at: ${RelayContract.address}`);
    } catch (error) {
        logger.error(error);
    }
}

async function deploySyncCandidate() {
    try {
        logger.info('Deploying SyncCandidate on Goerli');
        const SyncCandidateContract = await SyncCandidate.deploy();
        await SyncCandidateContract.deployed();
        logger.info(`Contract SyncCandidate deployed at: ${SyncCandidateContract.address}`);
    } catch (error) {
        logger.error(error);
    }
}

export async function compileAndDeployProxyContract(): Promise<Contract | undefined> {
    try {
        logger.info('Compiling ProxyContract');
        // DEPLOYED_CONTRACT_ADDRESS_LOGIC_CONTRACT_SYNC_CANDIDATE and DEPLOYED_CONTRACT_ADDRESS_SRC_CONTRACT_SYNC_CANDIDATE could be used 
        if (!DEPLOYED_CONTRACT_ADDRESS_STORAGE_MUMBAI|| !DEPLOYED_CONTRACT_ADDRESS_RELAY_GOERLI) {
            throw new Error('Contracts need to be deployed and set up in the .env file');
        }
        const compiledProxy = await ProxyContractBuilder.compiledAbiAndBytecode(DEPLOYED_CONTRACT_ADDRESS_RELAY_GOERLI, DEPLOYED_CONTRACT_ADDRESS_STORAGE_MUMBAI, DEPLOYED_CONTRACT_ADDRESS_STORAGE_MUMBAI);
        if (compiledProxy.error) {
            throw Error('Could not compile proxy');
        }
        logger.info('Deploying ProxyContract on Goerli');
        const proxyFactory = new ethers.ContractFactory(PROXY_INTERFACE, compiledProxy.bytecode, goerliSigner);
        const proxyContract: Contract = await proxyFactory.deploy();
        logger.info(`Contract ProxyContract deployed at: ${proxyContract.address}`);
        return proxyContract || undefined;
    } catch (error) {
        logger.error(error);
        return undefined;
    }
}
