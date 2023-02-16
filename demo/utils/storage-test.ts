import { BigNumber, ethers } from 'ethers';
import { logger } from '../../src/utils/logger';
import { ContractArtifacts } from './artifacts';
import DiffHandler from '../../src/diffHandler/DiffHandler';
import { SimpleStorage } from '../../src-gen/types/SimpleStorage';
import { RelayContract } from '../../src-gen/types/RelayContract';
import { ProxyContract } from '../../src-gen/types/ProxyContract';

require('dotenv').config();

logger.setSettings({ minLevel: 'debug', name: 'storage-test' });

const {
    CONTRACT_TARGETCHAIN_PROXY_UNUSED, CONTRACT_SOURCECHAIN_SOURCE_UNUSED, CONTRACT_TARGETCHAIN_PROXY, CONTRACT_SOURCECHAIN_SOURCE, CONTRACT_TARGETCHAIN_LOGIC, CONTRACT_TARGETCHAIN_RELAY,
} = process.env;

async function main() {
    const differ = new DiffHandler(ContractArtifacts.sourceProvider, ContractArtifacts.targetProvider);

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

    const contractTargetChainRelay = <RelayContract> new ethers.Contract(
        CONTRACT_TARGETCHAIN_RELAY as string,
        ContractArtifacts.abiRelay,
        ContractArtifacts.targetSigner,
    );

    const contractTargetChainProxy = <ProxyContract> new ethers.Contract(
        CONTRACT_TARGETCHAIN_PROXY_UNUSED as string,
        ContractArtifacts.abiProxyContract,
        ContractArtifacts.targetSigner,
    );

    const value:BigNumber = await contractSourceChainSource.getA();
    logger.debug('Value of logic source contract is:', value);
    logger.debug('Value of logic source contract is:', value.toNumber());

    const paddedSlot = ethers.utils.hexZeroPad('0x00', 32);
    const keyList = [paddedSlot];
    const keyValue = [ethers.utils.hexZeroPad('0x539', 32)];

    try {
        await contractTargetChainProxy.addStorage(keyList, keyValue, { gasLimit: 8000000 });
    } catch (error) {
        logger.error('Could not insert multiple values in srcContract');
        logger.error(error);
    }

    logger.debug(`srcContractAddress: ${contractSourceChainSource.address}, relayContract: ${contractTargetChainRelay.address}`);

    const latestBlockSource = await ContractArtifacts.sourceProvider.send('eth_getBlockByNumber', ['latest', true]);
    const sourceProof = await ContractArtifacts.sourceProvider.send('eth_getProof', [contractSourceChainSource.address, keyList, latestBlockSource.number]);

    const latestBlockTarget = await ContractArtifacts.targetProvider.send('eth_getBlockByNumber', ['latest', true]);
    const targetProof = await ContractArtifacts.targetProvider.send('eth_getProof', [contractTargetChainProxy.address, keyList, latestBlockTarget.number]);

    logger.debug(`proofs equal: ${sourceProof.storageHash === targetProof.storageHash}`);

    // should be 1337 or 3
    const tempDiff = await differ.getDiffFromStorage(contractSourceChainSource.address, contractTargetChainLogic.address, 'latest', 'latest', keyList[0], keyList[0]);
    logger.debug(`tempDiff src logic - proxy: ${JSON.stringify(tempDiff)}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        logger.error(error);
        process.exit(1);
    });
