import { describe, it, expect, vi } from 'vitest';
import { DEXAggregator } from '../aggregator';
import { DEXAdapter, Quote } from '../types';
import { Address } from 'viem';

const mockTokenIn = '0x1' as Address;
const mockTokenOut = '0x2' as Address;

const mockAdapter1: DEXAdapter = {
  name: 'DEX1',
  getQuote: async () => ({
    dex: 'DEX1',
    tokenIn: mockTokenIn,
    tokenOut: mockTokenOut,
    amountIn: 100n,
    amountOut: 90n,
    priceImpact: 0,
    route: [],
    estimatedGas: 1000n,
  }),
  buildSwapTx: async () => ({ to: '0x1', data: '0x' }),
};

const mockAdapter2: DEXAdapter = {
  name: 'DEX2',
  getQuote: async () => ({
    dex: 'DEX2',
    tokenIn: mockTokenIn,
    tokenOut: mockTokenOut,
    amountIn: 100n,
    amountOut: 95n, // Better price
    priceImpact: 0,
    route: [],
    estimatedGas: 1000n,
  }),
  buildSwapTx: async () => ({ to: '0x2', data: '0x' }),
};

describe('DEXAggregator', () => {
  it('should return the best quote', async () => {
    const aggregator = new DEXAggregator();
    aggregator.registerAdapter(mockAdapter1);
    aggregator.registerAdapter(mockAdapter2);

    const quote = await aggregator.getBestQuote(mockTokenIn, mockTokenOut, 100n);
    expect(quote).not.toBeNull();
    expect(quote?.dex).toBe('DEX2');
    expect(quote?.amountOut).toBe(95n);
  });
});
