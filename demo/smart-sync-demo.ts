import { ethers } from 'ethers';
import { logger } from '../src/utils/logger';

require('dotenv').config();

logger.setSettings({ minLevel: 'info', name: 'demo' });

const { PRIVATE_KEY, DEPLOYED_CONTRACT_ADDRESS_GOERLI, DEPLOYED_CONTRACT_ADDRESS_MUMBAI, RPC_URL_GOERLI, RPC_URL_MUMBAI } = process.env;

const goerliProvider = new ethers.providers.JsonRpcProvider(RPC_URL_GOERLI);
const polygonProvider = new ethers.providers.JsonRpcProvider(RPC_URL_MUMBAI);

const goerliSigner = new ethers.Wallet(PRIVATE_KEY as string, goerliProvider);
const polygonSigner = new ethers.Wallet(PRIVATE_KEY as string, polygonProvider);

const { abi, bytecode } = require('../artifacts/contracts/SimpleStorage.sol/SimpleStorage.json');

async function main() {
    const simpleStorageGoerli = new ethers.Contract(
        DEPLOYED_CONTRACT_ADDRESS_GOERLI as string,
        abi,
        goerliSigner,
    );
    const aGoerli = await simpleStorageGoerli.getA();
    logger.info(`value of a in goerli ${aGoerli}`);

    const simpleStoragePolygon = new ethers.Contract(
        DEPLOYED_CONTRACT_ADDRESS_MUMBAI as string,
        abi,
        polygonSigner,
    );
    const aPolygon = await simpleStoragePolygon.getA();
    logger.info(`value of a in polygon ${aPolygon}`);

    // the first variable stored by the contact is a
    // so it should be at index 0 in the storage.
    const newValue = 1337;
    const itemAtStorage = await polygonProvider.getStorageAt(simpleStoragePolygon.address, 0);
    logger.info(`value of a from polygon storage ${itemAtStorage}`);
    logger.info(`value of a in polygon using getter ${await simpleStoragePolygon.getA()}`);

    // eslint-disable-next-line no-underscore-dangle
    // false because item at storage is padded
    logger.info('value from storage as hex == value from getter', itemAtStorage._hex === await simpleStoragePolygon.getA()); 
    logger.info('value from storage as number == value set in contract', ethers.BigNumber.from(itemAtStorage).toNumber() === newValue);

    // using storage key to acces value at storage location
    const paddedSlot = ethers.utils.hexZeroPad('0x00', 32);
    const storageKey = paddedSlot;
    const storageLocation = await polygonProvider.getStorageAt(simpleStoragePolygon.address, storageKey);
    const storageValue = ethers.BigNumber.from(storageLocation);
    logger.info('value accessed with storage key as number == value set in contract', ethers.BigNumber.from(storageValue).toNumber() === newValue);

}

main();


// usage - npx hardhat run demo/smart-sync-demo.ts