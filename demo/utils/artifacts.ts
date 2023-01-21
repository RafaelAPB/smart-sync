/* eslint-disable global-require */
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

export namespace ContractArtifacts {

    export const goerliProvider = new ethers.providers.JsonRpcProvider(RPC_URL_GOERLI);
    export const polygonProvider = new ethers.providers.JsonRpcProvider(RPC_URL_MUMBAI);

    export const goerliSigner = new ethers.Wallet(PRIVATE_KEY as string, goerliProvider);
    export const polygonSigner = new ethers.Wallet(PRIVATE_KEY as string, polygonProvider);

    export const abiSimpleStorage = require('../../artifacts/contracts/SimpleStorage.sol/SimpleStorage.json').abi;
    export const bytecodeSimpleStorage = require('../../artifacts/contracts/SimpleStorage.sol/SimpleStorage.json').bytecode;

    export const SimpleStorage = new ethers.ContractFactory(abiSimpleStorage, bytecodeSimpleStorage, goerliSigner);

    export const abiRLPReader = require('../../artifacts/contracts/RLPReader.sol/RLPReader.json').abi;
    export const bytecodeRLPReader = require('../../artifacts/contracts/RLPReader.sol/RLPReader.json').bytecode;

    export const RLPReader = new ethers.ContractFactory(abiRLPReader, bytecodeRLPReader, goerliSigner);

    export const abiRelay = require('../../artifacts/contracts/RelayContract.sol/RelayContract.json').abi;
    export const bytecodeRelay = require('../../artifacts/contracts/RelayContract.sol/RelayContract.json').bytecode;

    export const Relay = new ethers.ContractFactory(abiRelay, bytecodeRelay, goerliSigner);

    export const abiMapping = require('../../artifacts/contracts/MappingContract.sol/MappingContract.json').abi;
    export const bytecodeMapping = require('../../artifacts/contracts/MappingContract.sol/MappingContract.json').bytecode;

    export const Mapper = new ethers.ContractFactory(abiMapping, bytecodeMapping, goerliSigner);

    export const abiSyncCandidate = require('../../artifacts/contracts/SyncCandidate.sol/SyncCandidate.json').abi;
    export const bytecodeSyncCandidate = require('../../artifacts/contracts/SyncCandidate.sol/SyncCandidate.json').bytecode;

    export const SyncCandidate = new ethers.ContractFactory(abiSyncCandidate, bytecodeSyncCandidate, goerliSigner);

    export const abiProxyContract = require('../../artifacts/contracts/ProxyContract.sol/ProxyContract.json').abi;
    export const bytecodeProxyContract = require('../../artifacts/contracts/ProxyContract.sol/ProxyContract.json').bytecode;

    export const ProxyContract = new ethers.ContractFactory(abiProxyContract, bytecodeProxyContract, goerliSigner);

}
