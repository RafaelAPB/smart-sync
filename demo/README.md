### Smart Sync Demo
This demo syncs the state of a contract in Polygon (source) to Goerli (target)


Run ``npx hardhat run demo/smart-sync-demo.ts``
To run single smart-sync unit test file - ``npm run test test/verify-proxy-test.ts``


### Flow

1. Deploy SimpleStorage - (on source chain, serve as logicContract and srcContract)
2. Deploy SimpleStorage - (on target chain)
3. Deploy RelayContract - (on target chain)
4. Deploy State Proxy (ProxyContract) - (on target chain), set relay, logic contract, srccontract addresses hardcoded
5. Modify values on Simple storage (source)
6. Create proof for 5. 
7. Add latest block root (which includes transaction from 5.) to relay contract
8. Modify storage of proxy contract according to 5.
9. Create proof for 5. in source chain
10. Create proof for 8. in target chain
11. Verify sync on the relay contract

## TODO
- Modularize RelayContract to take as input an instance of DendrETH. This contract will return the validated block roots. 
- Check which blockchains DendrETH supports (possibly Goerli to Polygon)