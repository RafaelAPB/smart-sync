/* eslint-disable @typescript-eslint/no-unused-vars */
import { ethers } from 'ethers';
import { logger } from '../../src/utils/logger';

require('dotenv').config();

logger.setSettings({ minLevel: 'info', name: 'demo-utils' });

const {
    PRIVATE_KEY, RPC_URL_GOERLI, RPC_URL_MUMBAI, RPC_LOCALHOST_ORIGIN, RPC_LOCALHOST_TARGET,
} = process.env;

const goerliProvider = new ethers.providers.JsonRpcProvider(RPC_URL_GOERLI);
const polygonProvider = new ethers.providers.JsonRpcProvider(RPC_URL_MUMBAI);

const goerliSigner = new ethers.Wallet(PRIVATE_KEY as string, goerliProvider);
const polygonSigner = new ethers.Wallet(PRIVATE_KEY as string, polygonProvider);

const abiSimpleStorage = require('../../artifacts/contracts/SimpleStorage.sol/SimpleStorage.json').abi;
const bytecodeSimpleStorage = require('../../artifacts/contracts/SimpleStorage.sol/SimpleStorage.json').bytecode;

const SimpleStorage = new ethers.ContractFactory(abiSimpleStorage, bytecodeSimpleStorage, goerliSigner);

const abiRLPReader = require('../../artifacts/contracts/RLPReader.sol/RLPReader.json').abi;
const bytecodeRLPReader = require('../../artifacts/contracts/RLPReader.sol/RLPReader.json').bytecode;

const RLPReader = new ethers.ContractFactory(abiRLPReader, bytecodeRLPReader, goerliSigner);

const abiRelayer = require('../../artifacts/contracts/RelayContract.sol/RelayContract.json').abi;
const bytecodeRelayer = require('../../artifacts/contracts/RelayContract.sol/RelayContract.json').bytecode;

const Relay = new ethers.ContractFactory(abiRelayer, bytecodeRelayer, goerliSigner);

const abiMapping = require('../../artifacts/contracts/MappingContract.sol/MappingContract.json').abi;
const bytecodeMapping = require('../../artifacts/contracts/MappingContract.sol/MappingContract.json').bytecode;

const Mapper = new ethers.ContractFactory(abiMapping, bytecodeMapping, goerliSigner);


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

async function main() {
    // await deploySimpleStorage();
    // await deployRLPReader();
    await deployRelay();
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        logger.error(error);
        process.exit(1);
    });
