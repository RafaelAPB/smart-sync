//SPDX-License-Identifier: Unlicense
pragma solidity 0.8.9;

contract StorageImitator {
    /**
    * @dev Set a list of storage keys
    */
    function setStorageKey(bytes32[] memory keys, bytes32[] memory values) public {
        for (uint i = 0; i < keys.length; i++) {
            // store the value in the right slot
            bytes32 slot = keys[i];
            bytes32 value = values[i];
            assembly {
                sstore(slot, value)
            }
        }
    }
}
