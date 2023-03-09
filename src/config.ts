export const PROXY_CONTRACT_FILE_PATH = './artifacts/contracts/ProxyContract.sol';

export const PROXY_CONTRACT_NAME = 'ProxyContract';

export const PROXY_CONTRACT_FILE_NAME = `${PROXY_CONTRACT_NAME}.json`;

/**
 * The placeholder address used in the `ProxyContract.sol` for the relay contract
 */
export const RELAY_CONTRACT_PLACEHOLDER_ADDRESS = '0x4f0CDCa5470BF943dC7510aBcf0300C815a08E2E';

/**
 * The placeholder address used in the `ProxyContract.sol` for the logic contract
 */
export const LOGIC_CONTRACT_PLACEHOLDER_ADDRESS = '0xf6eEcb3Cf7E5AE65133A4E4D1D1a9a1ca9d9e87b';

/**
 * The placeholder address used in the `ProxyContract.sol` for the logic contract
 */
export const SOURCE_CONTRACT_PLACEHOLDER_ADDRESS = '0xF7E3b5a30197D1AF39f5Bb7Bfb65FA67f15595a3';

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
