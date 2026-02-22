import { DEXAdapter, Quote, SwapParams } from './types';
import { Address, Hex, PublicClient, encodeFunctionData, parseAbi } from 'viem';
import { MONAD_CONTRACTS } from '../wallet/chains';

// ABI snippets
const QUOTER_ABI = parseAbi([
  'function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)'
]);

const ROUTER_ABI = parseAbi([
  'struct ExactInputSingleParams { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }',
  'function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut)'
]);

export class OpenClawAdapter implements DEXAdapter {
  name = 'OpenClaw';
  
  constructor(private publicClient: PublicClient) {}

  async getQuote(tokenIn: Address, tokenOut: Address, amountIn: bigint): Promise<Quote | null> {
    // For now, assume single hop with 0.3% fee
    const fee = 3000; 
    
    try {
      // Simulate call to Quoter
      // Note: Quoter functions are not view, they revert with result. 
      // Need to use callStatic or simulateContract.
      // But QuoterV2 (if used) has view functions? No, usually not.
      // Using publicClient.simulateContract is correct.
      
      const { result } = await this.publicClient.simulateContract({
        address: MONAD_CONTRACTS.Quoter,
        abi: QUOTER_ABI,
        functionName: 'quoteExactInputSingle',
        args: [tokenIn, tokenOut, fee, amountIn, 0n],
      });

      const amountOut = result;

      return {
        dex: this.name,
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
        priceImpact: 0, // TODO: Calculate price impact
        route: [tokenIn, tokenOut],
        estimatedGas: 150000n, // Estimated
      };
    } catch (e) {
      console.warn('Quote failed on OpenClaw', e);
      return null;
    }
  }

  async buildSwapTx(params: SwapParams, quote: Quote): Promise<{ to: Address; data: Hex; value?: bigint }> {
    const fee = 3000; // Should come from quote route
    const amountOutMinimum = quote.amountOut * BigInt(10000 - params.slippage * 100) / 10000n;

    const args = {
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      fee: fee,
      recipient: params.recipient,
      deadline: params.deadline,
      amountIn: params.amountIn,
      amountOutMinimum: amountOutMinimum,
      sqrtPriceLimitX96: 0n,
    };

    const data = encodeFunctionData({
      abi: ROUTER_ABI,
      functionName: 'exactInputSingle',
      args: [args],
    });

    return {
      to: MONAD_CONTRACTS.SwapRouter,
      data,
      value: 0n, // Handle ETH wrapping if needed
    };
  }
}
