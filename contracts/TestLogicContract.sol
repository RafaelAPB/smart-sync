//SPDX-License-Identifier: Unlicense
pragma solidity 0.8.9;

/**
* @dev A contract to test proxy calls
*/
contract TestLogicContract {

    address _offset;

    uint256 value;

    function getValue() public view returns (uint256) {
        return value;
    }

    function setValue(uint256 _value) public  {
        value = _value;
    }

    function valuePure() public pure returns (uint256) {
        return 42;
    }

}
