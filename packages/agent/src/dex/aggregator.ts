import { DEXAdapter, Quote, SwapParams } from './types';
import { Address, Hex } from 'viem';

export class DEXAggregator {
  private adapters: DEXAdapter[] = [];

  constructor() {}

  registerAdapter(adapter: DEXAdapter) {
    this.adapters.push(adapter);
  }

  async getBestQuote(
    tokenIn: Address,
    tokenOut: Address,
    amountIn: bigint
  ): Promise<Quote | null> {
    const quotes = await Promise.all(
      this.adapters.map(async (adapter) => {
        try {
          return await adapter.getQuote(tokenIn, tokenOut, amountIn);
        } catch (e) {
          console.error(`Failed to get quote from ${adapter.name}:`, e);
          return null;
        }
      })
    );

    const validQuotes = quotes.filter((q): q is Quote => q !== null);
    
    if (validQuotes.length === 0) return null;

    // Sort by amountOut descending (best price)
    // In a real implementation, consider gas costs (net output)
    validQuotes.sort((a, b) => {
      if (a.amountOut > b.amountOut) return -1;
      if (a.amountOut < b.amountOut) return 1;
      return 0;
    });

    return validQuotes[0];
  }

  async buildSwapTx(params: SwapParams, quote: Quote) {
    const adapter = this.adapters.find(a => a.name === quote.dex);
    if (!adapter) throw new Error(`Adapter ${quote.dex} not found`);
    
    return adapter.buildSwapTx(params, quote);
  }
}
