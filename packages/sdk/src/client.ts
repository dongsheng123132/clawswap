import { createWalletClient, http, privateKeyToAccount } from 'viem';
import { monadTestnet } from 'viem/chains';
import { wrapFetchWithPayment } from '@x402/fetch';
import { ExactEvmScheme } from '@x402/evm';
import { SDKConfig, QuoteParams, QuoteResult, SwapParams, SwapResult } from './types';

export class OpenClawSDK {
  private fetch: typeof fetch;

  constructor(private config: SDKConfig) {
    if (config.walletPrivateKey) {
      const account = privateKeyToAccount(config.walletPrivateKey);
      const walletClient = createWalletClient({
        account,
        chain: monadTestnet,
        transport: http(config.rpcUrl || 'https://testnet-rpc.monad.xyz'),
      });

      const scheme = new ExactEvmScheme({
        chainId: 10143,
        tokenAddress: '0x534b2f3A21130d7a60830c2Df862319e593943A3', // USDC
      });

      // Wrap fetch with x402 payment capability
      this.fetch = wrapFetchWithPayment(fetch, {
        schemes: [scheme],
        walletClient: walletClient as any,
        publicClient: undefined, // Optional if walletClient handles signing
      });
    } else {
      this.fetch = fetch;
    }
  }

  async getQuote(params: QuoteParams): Promise<QuoteResult> {
    const url = new URL(`${this.config.apiUrl}/api/v1/quote`);
    url.searchParams.set('tokenIn', params.tokenIn);
    url.searchParams.set('tokenOut', params.tokenOut);
    url.searchParams.set('amountIn', params.amountIn);

    const res = await this.fetch(url.toString());
    if (!res.ok) {
      throw new Error(`Failed to get quote: ${res.statusText}`);
    }
    return res.json();
  }

  async executeSwap(params: SwapParams): Promise<SwapResult> {
    const res = await this.fetch(`${this.config.apiUrl}/api/v1/swap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      throw new Error(`Failed to execute swap: ${res.statusText}`);
    }
    return res.json();
  }
}
