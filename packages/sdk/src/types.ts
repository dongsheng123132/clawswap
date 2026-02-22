import { Address, Hex } from 'viem';

export interface SDKConfig {
  apiUrl: string;
  walletPrivateKey?: Hex;
  rpcUrl?: string;
}

export interface QuoteParams {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
}

export interface SwapParams {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  walletAddress: Address;
  slippage?: number;
}

export interface QuoteResult {
  amountOut: string;
  priceImpact: number;
  fee: number;
  dex: string;
}

export interface SwapResult {
  txData: {
    to: Address;
    data: Hex;
    value: string;
    chainId: number;
  };
}
