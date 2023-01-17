export const PROXY_CONTRACT_FILE_PATH = './artifacts/contracts/ProxyContract.sol';

export const PROXY_CONTRACT_NAME = 'ProxyContract';

export const PROXY_CONTRACT_FILE_NAME = `${PROXY_CONTRACT_NAME}.json`;

/**
 * The placeholder address used in the `ProxyContract.sol` for the relay contract
 */
export const RELAY_CONTRACT_PLACEHOLDER_ADDRESS = '0x75b82024F44F5633983B49558Fb66Cd113655ae4';

/**
 * The placeholder address used in the `ProxyContract.sol` for the logic contract
 */
export const LOGIC_CONTRACT_PLACEHOLDER_ADDRESS = '0xA182E0C806fc7B2f5509CE7E325f9600f1f50fe9';

/**
 * The placeholder address used in the `ProxyContract.sol` for the logic contract
 */
export const SOURCE_CONTRACT_PLACEHOLDER_ADDRESS = '0x9a14933252EeF180aCfBCADBAb01A1ca8A61a833';

export const PROXY_INTERFACE = [
    'constructor()',
    'function updateStorage(bytes memory proof, uint blockNumber) public',
    'function computeRoots(bytes memory rlpProofNode) view returns (bytes32, bytes32)',
    'function insert(uint _key, uint _value) public',
    'function getValue(uint _key) public view returns (uint256)',
    'function addStorage(bytes32[] memory keys, bytes32[] memory values) public',
    'function getSourceAddress() public view returns (address)',
    'function getRelayAddress() pure returns (address)',
    'function getLogicAddress() public view returns (address)',
];
