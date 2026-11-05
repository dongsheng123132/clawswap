// SPDX-License-Identifier: MIT
pragma solidity =0.7.6;

/// @title Test USDC - freely mintable ERC20 for testnet
contract TestUSDC {
    string public name     = "Test USD Coin";
    string public symbol   = "USDC";
    uint8  public decimals = 6;

    event Approval(address indexed owner, address indexed spender, uint value);
    event Transfer(address indexed from, address indexed to, uint value);

    mapping (address => uint)                       public balanceOf;
    mapping (address => mapping (address => uint))  public allowance;
    uint public totalSupply;

    /// @notice Anyone can mint test USDC (testnet only!)
    function mint(address to, uint amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint amount) external returns (bool) {
        return transferFrom(msg.sender, to, amount);
    }

    function transferFrom(address from, address to, uint amount) public returns (bool) {
        require(balanceOf[from] >= amount, "insufficient balance");

        if (from != msg.sender && allowance[from][msg.sender] != uint(-1)) {
            require(allowance[from][msg.sender] >= amount, "insufficient allowance");
            allowance[from][msg.sender] -= amount;
        }

        balanceOf[from] -= amount;
        balanceOf[to] += amount;

        emit Transfer(from, to, amount);
        return true;
    }
}
