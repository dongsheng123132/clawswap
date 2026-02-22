import { Address, Hex } from 'viem';

export interface Quote {
  dex: string;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  amountOut: bigint;
  priceImpact: number;
  route: any[]; // Route path
  estimatedGas: bigint;
  data?: Hex; // Calldata for swap if available
}

export interface SwapParams {
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  slippage: number; // Percentage, e.g. 0.5 for 0.5%
  recipient: Address;
  deadline: bigint;
}

export interface DEXAdapter {
  name: string;
  getQuote(
    tokenIn: Address,
    tokenOut: Address,
    amountIn: bigint
  ): Promise<Quote | null>;
  
  buildSwapTx(
    params: SwapParams,
    quote: Quote
  ): Promise<{ to: Address; data: Hex; value?: bigint }>;

  getSupportedTokens?(): Promise<Address[]>;
}
