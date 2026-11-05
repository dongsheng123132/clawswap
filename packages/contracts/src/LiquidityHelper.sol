// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

interface IPool {
    function mint(address recipient, int24 tickLower, int24 tickUpper, uint128 amount, bytes calldata data) external returns (uint256 amount0, uint256 amount1);
    function token0() external view returns (address);
    function token1() external view returns (address);
}

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title Minimal helper to add liquidity to a Uniswap V3 pool
contract LiquidityHelper {
    address public pool;
    address public token0;
    address public token1;

    function addLiquidity(
        address _pool,
        int24 tickLower,
        int24 tickUpper,
        uint128 amount
    ) external returns (uint256 amount0, uint256 amount1) {
        pool = _pool;
        token0 = IPool(_pool).token0();
        token1 = IPool(_pool).token1();
        (amount0, amount1) = IPool(_pool).mint(
            msg.sender,
            tickLower,
            tickUpper,
            amount,
            ""
        );
    }

    /// @notice Callback from pool.mint — transfer tokens to the pool
    function uniswapV3MintCallback(
        uint256 amount0Owed,
        uint256 amount1Owed,
        bytes calldata
    ) external {
        require(msg.sender == pool, "not pool");
        if (amount0Owed > 0) {
            IERC20(token0).transfer(msg.sender, amount0Owed);
        }
        if (amount1Owed > 0) {
            IERC20(token1).transfer(msg.sender, amount1Owed);
        }
    }
}
