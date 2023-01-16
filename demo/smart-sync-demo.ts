import { ethers } from 'ethers';
import DiffHandler from '../src/diffHandler/DiffHandler';
import GetProof from '../src/proofHandler/GetProof';
import { logger } from '../src/utils/logger';
import { verifyEthGetProof } from '../test/test-utils';

require('dotenv').config();

logger.setSettings({ minLevel: 'info', name: 'demo' });

const {
    PRIVATE_KEY, DEPLOYED_CONTRACT_ADDRESS_STORAGE_GOERLI, DEPLOYED_CONTRACT_ADDRESS_STORAGE_MUMBAI, RPC_URL_GOERLI, RPC_URL_MUMBAI, RPC_LOCALHOST_ORIGIN, RPC_LOCALHOST_TARGET,DEPLOYED_CONTRACT_ADDRESS_RELAY_GOERLI
} = process.env;

const goerliProvider = new ethers.providers.JsonRpcProvider(RPC_URL_GOERLI);
const polygonProvider = new ethers.providers.JsonRpcProvider(RPC_URL_MUMBAI);

const goerliSigner = new ethers.Wallet(PRIVATE_KEY as string, goerliProvider);
const polygonSigner = new ethers.Wallet(PRIVATE_KEY as string, polygonProvider);

const { abi, bytecode } = require('../artifacts/contracts/SimpleStorage.sol/SimpleStorage.json');
const abiRelay = require('../artifacts/contracts/RelayContract.sol/RelayContract.json').abi;
const bytecodeRelay = require('../artifacts/contracts/RelayContract.sol/RelayContract.json').bytecode;

const differ = new DiffHandler(polygonProvider);

async function main() {
    // STEP: Deploy/Retrieve Base Contracts //
    const simpleStorageGoerli = new ethers.Contract(
        DEPLOYED_CONTRACT_ADDRESS_STORAGE_GOERLI as string,
        abi,
        goerliSigner,
    );
    const aGoerli = await simpleStorageGoerli.getA();
    logger.info(`value of variable "a" in goerli ${aGoerli}`);

    const simpleStoragePolygon = new ethers.Contract(
        DEPLOYED_CONTRACT_ADDRESS_STORAGE_MUMBAI as string,
        abi,
        polygonSigner,
    );

    // STARTING STATE:
    // In Polygon, starting state is at block number 30619625  https://mumbai.polygonscan.com/tx/0x4327a6312d62297c0ac6191c01f995da823e56c43726ea24ffd9c62e97cc96c9
    // In Goerli starting state is at block 8266352 https://goerli.etherscan.io/tx/0xd24a015517a84b68bdb7cb766cde433dc9026ed253ad04a39bc3e6676ee4be81
    // phase 1 - get storage values for variables of interest
    const aPolygon = await simpleStoragePolygon.getA();

    logger.info(`value of variable "a" in polygon ${aPolygon}`);

    // the first variable stored by the contact is a
    // so it should be at index 0 in the storage.
    const newValue = 1337;
    const itemAtStorage = await polygonProvider.getStorageAt(simpleStoragePolygon.address, 0);

    logger.info(`value of a from polygon storage ${itemAtStorage}`);
    logger.info(`value of a in polygon using getter ${await simpleStoragePolygon.getA()}`);

    // false because item at storage is padded
    // eslint-disable-next-line no-underscore-dangle
    logger.info('value from storage as hex == value from getter', itemAtStorage._hex === await simpleStoragePolygon.getA());
    logger.info('value from storage as number == value set in contract', ethers.BigNumber.from(itemAtStorage).toNumber() === newValue);

    // using storage key to access value at storage location
    // fixed size 32 byte variables are assigned an individual storage slot
    const paddedSlot = ethers.utils.hexZeroPad('0x00', 32);
    const paddedSlotVarB = ethers.utils.hexZeroPad('0x01', 32);

    const storageKey = paddedSlot;

    const storageValueSrc = await polygonProvider.getStorageAt(simpleStoragePolygon.address, storageKey);
    const storageValueVarB = await polygonProvider.getStorageAt(simpleStoragePolygon.address, paddedSlotVarB);
    const storageValueDecimal = ethers.BigNumber.from(storageValueSrc);
    const storageValueBDecimal = ethers.BigNumber.from(storageValueVarB);
    logger.info('value accessed with storage key as number == value set in contract', storageValueDecimal.toNumber() === newValue);
    logger.info('value var b', storageValueBDecimal);

    // Phase 3: Calculate state diff // 30619625 = 1D337E9; 8266352 = 7E2270; //
    const diff = await differ.getDiffFromStorage(simpleStoragePolygon.address, simpleStorageGoerli.address, '0x1D337E9', '0x7E2270', storageKey, storageKey);
    logger.info('Diff between storages right after setting values of A is: ', diff);

    // Phase 4: Get storage proofs //

    const keyList = [storageKey];
    // get the latest block
    const block = await polygonProvider.send('eth_getBlockByNumber', ['latest', true]);
    // Gets updated merkle proof (latest block) for our Polygon address
    const proof = await polygonProvider.send('eth_getProof', [simpleStoragePolygon.address, keyList, block.number]);
    logger.info(`Proof for storage key ${proof.storageProof[0].key} of address ${simpleStoragePolygon.address} is: ${proof.storageProof[0].proof}`);

    // https://mumbai.polygonscan.com/address/0x5110B4b4Fea7137895d33B8a0b11330A1B2586E9 block before contract deployment

    const blockJustBefore = await polygonProvider.send('eth_getBlockByNumber', ['0x1D337E2', false]);
    const proofJustBefore = await polygonProvider.send('eth_getProof', [simpleStoragePolygon.address, keyList, blockJustBefore.number]);

    // https://mumbai.polygonscan.com/tx/0x4327a6312d62297c0ac6191c01f995da823e56c43726ea24ffd9c62e97cc96c9 block after method setA
    const blockJustAfter = await polygonProvider.send('eth_getBlockByNumber', ['0x1D337E9', false]);
    const proofJustAfter = await polygonProvider.send('eth_getProof', [simpleStoragePolygon.address, keyList, blockJustAfter.number]);

    // should be false because contract was not deployed yet
    logger.info('Proof === proof block before?: ', proof.storageProof[0].proof[0] === proofJustBefore.storageProof[0].proof[0]);

    // should be true if setA is no longer changed
    logger.info('Proof === proof block after?: ', proof.storageProof[0].proof[0] === proofJustAfter.storageProof[0].proof[0]);
    const isProofValid = await verifyEthGetProof(proof, block.stateRoot);
    logger.info('Proof is valid: ', isProofValid);

    // Phase 5: create optimized merkle proof //
    const optimizedProof = await new GetProof(proof).optimizedStorageProof([]);
    logger.info('optimizedProof: ', optimizedProof);
    // STEP: Deploy / Retrieve Relay Contract - hosted in Goerli //

    const relayGoerli = new ethers.Contract(
        DEPLOYED_CONTRACT_ADDRESS_RELAY_GOERLI as string,
        abiRelay,
        goerliSigner,
    );
        logger.info(`Using relay contract deployed at ${relayGoerli.address}`);
    // STEP: Deploy / Retrieve Secondary Contract (State Proxy) //
}

main();

// usage - npx hardhat run demo/smart-sync-demo.ts
// to run single smart-sync unit test file - npm run test test/verify-proxy-test.ts
