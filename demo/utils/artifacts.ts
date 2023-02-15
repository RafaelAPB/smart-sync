/* eslint-disable global-require */
import { ethers } from 'ethers';
import { logger } from '../../src/utils/logger';
require('dotenv').config();

logger.setSettings({ minLevel: 'info', name: 'demo-utils:deploy-contracts' });

const {
    PRIVATE_KEY, RPC_URL_GOERLI, RPC_URL_ETH_MAINNET,RPC_URL_MUMBAI,
} = process.env;

export namespace ContractArtifacts {

    export const goerliProvider = new ethers.providers.JsonRpcProvider(RPC_URL_GOERLI);
    export const ethereumProvider = new ethers.providers.JsonRpcProvider(RPC_URL_ETH_MAINNET);
    export const mumbaiProvider = new ethers.providers.JsonRpcProvider(RPC_URL_MUMBAI);

    export const goerliSigner = new ethers.Wallet(PRIVATE_KEY as string, goerliProvider);
    export const ethereumSigner = new ethers.Wallet(PRIVATE_KEY as string, ethereumProvider);
    export const mumbaiSigner = new ethers.Wallet(PRIVATE_KEY as string, mumbaiProvider);
    
    export const source = "goerli";
    export const target = "mumbai"
    export const sourceSigner = goerliSigner;
    export const targetSigner = mumbaiSigner;

    export const abiSimpleStorage = require('../../artifacts/contracts/SimpleStorage.sol/SimpleStorage.json').abi;
    export const bytecodeSimpleStorage = require('../../artifacts/contracts/SimpleStorage.sol/SimpleStorage.json').bytecode;
    export const SimpleStorageTarget = new ethers.ContractFactory(abiSimpleStorage, bytecodeSimpleStorage, targetSigner);
    export const SimpleStorageSource = new ethers.ContractFactory(abiSimpleStorage, bytecodeSimpleStorage, sourceSigner);

    export const abiRLPReader = require('../../artifacts/contracts/RLPReader.sol/RLPReader.json').abi;
    export const bytecodeRLPReader = require('../../artifacts/contracts/RLPReader.sol/RLPReader.json').bytecode;
    export const RLPReaderTarget = new ethers.ContractFactory(abiRLPReader, bytecodeRLPReader, targetSigner);

    export const abiRelay = require('../../artifacts/contracts/RelayContract.sol/RelayContract.json').abi;
    export const bytecodeRelay = require('../../artifacts/contracts/RelayContract.sol/RelayContract.json').bytecode;
    export const RelayTarget = new ethers.ContractFactory(abiRelay, bytecodeRelay, targetSigner);

    export const abiMapping = require('../../artifacts/contracts/MappingContract.sol/MappingContract.json').abi;
    export const bytecodeMapping = require('../../artifacts/contracts/MappingContract.sol/MappingContract.json').bytecode;
    export const MapperTarget = new ethers.ContractFactory(abiMapping, bytecodeMapping, targetSigner);

    export const abiSyncCandidate = require('../../artifacts/contracts/SyncCandidate.sol/SyncCandidate.json').abi;
    export const bytecodeSyncCandidate = require('../../artifacts/contracts/SyncCandidate.sol/SyncCandidate.json').bytecode;
    export const SyncCandidateTarget = new ethers.ContractFactory(abiSyncCandidate, bytecodeSyncCandidate, targetSigner);

    export const abiProxyContract = require('../../artifacts/contracts/ProxyContract.sol/ProxyContract.json').abi;
    export const bytecodeProxyContract = require('../../artifacts/contracts/ProxyContract.sol/ProxyContract.json').bytecode;
    export const ProxyContractTarget = new ethers.ContractFactory(abiProxyContract, bytecodeProxyContract, targetSigner);

}
