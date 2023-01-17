/* eslint-disable @typescript-eslint/no-unused-vars */
import { expect } from 'chai';
import { Contract, ethers } from 'ethers';
import { PROXY_INTERFACE } from '../../src/config';
import DiffHandler from '../../src/diffHandler/DiffHandler';
import GetProof from '../../src/proofHandler/GetProof';
import { logger } from '../../src/utils/logger';
import ProxyContractBuilder from '../../src/utils/proxy-contract-builder';

require('dotenv').config();

logger.setSettings({ minLevel: 'info', name: 'demo-utils:init-contracts' });

const {
    PRIVATE_KEY, RPC_URL_GOERLI, RPC_URL_MUMBAI, RPC_LOCALHOST_ORIGIN, RPC_LOCALHOST_TARGET, DEPLOYED_CONTRACT_ADDRESS_RELAY_GOERLI, DEPLOYED_CONTRACT_ADDRESS_SRC_CONTRACT_SYNC_CANDIDATE, DEPLOYED_CONTRACT_ADDRESS_LOGIC_CONTRACT_SYNC_CANDIDATE
} = process.env;

const goerliProvider = new ethers.providers.JsonRpcProvider(RPC_URL_GOERLI);
const polygonProvider = new ethers.providers.JsonRpcProvider(RPC_URL_MUMBAI);

const goerliSigner = new ethers.Wallet(PRIVATE_KEY as string, goerliProvider);
const polygonSigner = new ethers.Wallet(PRIVATE_KEY as string, polygonProvider);

async function initProxyContract(contract: Contract, proof: GetProof, srcContractAddress)    {
    const proxyKeys: Array<string> = [];
    const proxyValues: Array<string> = [];
    proof.storageProof.forEach((p) => {
        proxyKeys.push(ethers.utils.hexZeroPad(p.key, 32));
        proxyValues.push(ethers.utils.hexZeroPad(p.value, 32));
    });
    await contract.addStorage(proxyKeys, proxyValues);

    // The storage diff between `srcContract` and `proxyContract` comes up empty: both storage layouts are the same
    const differ = new DiffHandler(goerliProvider);
    const diff = await differ.getDiffFromStorage(srcContractAddress, contract.address);

    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    expect(diff.isEmpty()).to.be.true;
}

async function main() {
    
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        logger.error(error);
        process.exit(1);
    });