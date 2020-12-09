pragma solidity >=0.5.0 <0.8.0;

import "./MerklePatriciaProof.sol";
import "solidity-rlp/contracts/RLPReader.sol";

library GetProofLib {
    using RLPReader for RLPReader.RLPItem;
    using RLPReader for RLPReader.Iterator;
    using RLPReader for bytes;

    struct Account {
        uint nonce; // 0
        uint balance; // 1
        bytes32 storageHash; // 2
        bytes32 codeHash; // 3
    }

    struct GetProof {
        bytes account;
        bytes accountProof;
        bytes storageProofs;
    }

    struct StorageProof {
        bytes key;
        bytes value;
        bytes proof;
    }

    // TODO this can be removed
    function verifyProof(bytes memory rlpAccount, bytes memory rlpAccountNodes, bytes memory encodedPath, bytes32 root) internal pure returns (bool) {
        return MerklePatriciaProof.verify(rlpAccount, encodedPath, rlpAccountNodes, root);
    }


    function verifyStorageProof(bytes memory rlpProof, bytes32 storageHash) internal pure returns (bool) {
        StorageProof memory proof = parseStorageProof(rlpProof);
        return MerklePatriciaProof.verify(
            proof.value, proof.key, proof.proof, storageHash
        );
    }

    function parseStorageProof(bytes memory rlpProof) internal pure returns (StorageProof memory proof) {
        RLPReader.Iterator memory it =
        rlpProof.toRlpItem().iterator();

        uint idx;
        while (it.hasNext()) {
            if (idx == 0) {
                proof.key = it.next().toBytes();
            } else if (idx == 1) {
                proof.value = it.next().toBytes();
            } else if (idx == 2) {
                proof.proof = it.next().toBytes();
            } else {
                it.next();
            }
            idx++;
        }
        return proof;
    }

    function parseAccount(bytes memory rlpAccount) internal pure returns (Account memory account) {
        RLPReader.Iterator memory it =
        rlpAccount.toRlpItem().iterator();

        uint idx;
        while (it.hasNext()) {
            if (idx == 0) {
                account.nonce = it.next().toUint();
            } else if (idx == 1) {
                account.balance = it.next().toUint();
            } else if (idx == 2) {
                account.storageHash = bytes32(it.next().toUint());
            } else if (idx == 3) {
                account.codeHash = bytes32(it.next().toUint());
            } else {
                it.next();
            }
            idx++;
        }

        return account;
    }

    function parseProofTest(bytes memory rlpProof) internal pure returns (bytes memory account, bytes memory accountProof, bytes memory storageProof) {
        GetProof memory proof = parseProof(rlpProof);
        account = proof.account;
        accountProof = proof.accountProof;
        storageProof = proof.storageProofs;
        return (account, accountProof, storageProof);
    }
    /**
    * @dev parses an rlp encoded EIP1186 proof
    * @return proof The parsed Proof
    */
    function parseProof(bytes memory rlpProof) internal pure returns (GetProof memory proof) {
        RLPReader.Iterator memory it =
        rlpProof.toRlpItem().iterator();

        uint idx;
        while (it.hasNext()) {
            if (idx == 0) {
                proof.account = it.next().toBytes();
            } else if (idx == 1) {
                proof.accountProof = it.next().toBytes();
            } else if (idx == 2) {
                proof.storageProofs = it.next().toBytes();
            } else {
                it.next();
            }
            idx++;
        }
        return proof;
    }

    /**
    * @dev Encodes the address `_a` as path leading to its account in the state trie
    * @return path The path in the state trie leading to the account
    */
    function encodedAddress(address _a) internal view returns (bytes memory path) {
        bytes memory hp = hex"00";
        bytes memory key = abi.encodePacked(keccak256(abi.encodePacked(_a)));
        path = abi.encodePacked(hp, key);
        return path;
    }
}