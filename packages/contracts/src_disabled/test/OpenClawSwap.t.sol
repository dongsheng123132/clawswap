// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.6;
pragma abicoder v2;

import "forge-std/Test.sol";
import "../src/core/OpenClawFactory.sol";
import "../src/core/OpenClawPool.sol";
import "../src/periphery/SwapRouter.sol";
import "../src/periphery/Quoter.sol";
import "../src/periphery/libraries/PoolAddress.sol";

contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory _name, string memory _symbol, uint256 _supply) {
        name = _name;
        symbol = _symbol;
        totalSupply = _supply;
        balanceOf[msg.sender] = _supply;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract OpenClawSwapTest is Test {
    OpenClawFactory factory;
    SwapRouter router;
    Quoter quoter;
    
    MockERC20 tokenA;
    MockERC20 tokenB;
    MockERC20 weth;

    function setUp() public {
        // Deploy Factory
        factory = new OpenClawFactory();
        
        // Deploy Mock Tokens
        tokenA = new MockERC20("Token A", "TKA", 1000000 ether);
        tokenB = new MockERC20("Token B", "TKB", 1000000 ether);
        weth = new MockERC20("Wrapped Monad", "WMON", 1000000 ether);

        // Deploy Periphery
        router = new SwapRouter(address(factory), address(weth));
        quoter = new Quoter(address(factory), address(weth));

        // Sort tokens
        if (address(tokenA) > address(tokenB)) {
            (tokenA, tokenB) = (tokenB, tokenA);
        }
    }

    function testPrintInitCodeHash() public {
        bytes memory creationCode = type(OpenClawPool).creationCode;
        bytes32 hash = keccak256(creationCode);
        console.log("OpenClawPool Init Code Hash:");
        console.logBytes32(hash);
        
        // This is what needs to be in PoolAddress.sol
    }

    function testCreatePool() public {
        address pool = factory.createPool(address(tokenA), address(tokenB), 3000);
        assertTrue(pool != address(0));
        
        // Check pool parameters
        OpenClawPool(pool).fee();
    }

    // Add more tests for swap, mint, etc.
}
