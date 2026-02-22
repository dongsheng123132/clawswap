// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.6;
pragma abicoder v2;

import "forge-std/Script.sol";
import "../src/core/OpenClawFactory.sol";
import "../src/periphery/SwapRouter.sol";
import "../src/periphery/Quoter.sol";
import "../src/periphery/NonfungiblePositionManager.sol";

contract DeployScript is Script {
    function setUp() public {}

    function run() public {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address weth = vm.envAddress("WMON_ADDRESS"); // Must be set in .env or passed

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy Factory
        OpenClawFactory factory = new OpenClawFactory();
        console.log("Factory deployed at:", address(factory));

        // 2. Deploy Router
        SwapRouter router = new SwapRouter(address(factory), weth);
        console.log("SwapRouter deployed at:", address(router));

        // 3. Deploy Quoter
        Quoter quoter = new Quoter(address(factory), weth);
        console.log("Quoter deployed at:", address(quoter));

        // 4. Deploy NFPM
        // Token descriptor is usually another contract, using address(0) for simplicity if not needed immediately
        // or deploy one.
        address tokenDescriptor = address(0); 
        NonfungiblePositionManager nfpm = new NonfungiblePositionManager(
            address(factory),
            weth,
            tokenDescriptor
        );
        console.log("NFPM deployed at:", address(nfpm));

        vm.stopBroadcast();
    }
}
