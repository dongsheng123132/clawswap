import { useState, useEffect } from 'react';
import {
  createPublicClient,
  http,
  parseUnits,
  formatUnits,
  parseAbi,
  type Address,
} from 'viem';
import { MONAD_CONTRACTS } from '@/lib/chains';

const monadClient = createPublicClient({
  chain: {
    id: 10143,
    name: 'Monad Testnet',
    nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
    rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } },
  } as any,
  transport: http('https://testnet-rpc.monad.xyz'),
});

const QUOTER_V2_ABI = parseAbi([
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
]);

function symbolToAddress(symbol: string): Address | null {
  const s = symbol.toUpperCase();
  if (s === 'MON' || s === 'WMON') return MONAD_CONTRACTS.WMON as Address;
  if (s === 'USDC') return MONAD_CONTRACTS.USDC as Address;
  return null;
}

function symbolToDecimals(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s === 'MON' || s === 'WMON') return 18;
  if (s === 'USDC') return 6;
  return 18;
}

export function useQuote(tokenIn: string, tokenOut: string, amountIn: string) {
  const [quote, setQuote] = useState<{
    amountOut: string;
    priceImpact: number;
    fee: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!amountIn || amountIn === '0' || Number(amountIn) <= 0) {
      setQuote(null);
      return;
    }

    const fetchQuote = async () => {
      setLoading(true);
      try {
        const addrIn = symbolToAddress(tokenIn);
        const addrOut = symbolToAddress(tokenOut);
        if (!addrIn || !addrOut) {
          setQuote(null);
          return;
        }

        const decimalsOut = symbolToDecimals(tokenOut);
        const amountInWei = parseUnits(amountIn, symbolToDecimals(tokenIn));

        const result = await monadClient.simulateContract({
          address: MONAD_CONTRACTS.Quoter as Address,
          abi: QUOTER_V2_ABI,
          functionName: 'quoteExactInputSingle',
          args: [
            {
              tokenIn: addrIn,
              tokenOut: addrOut,
              amountIn: amountInWei,
              fee: 3000,
              sqrtPriceLimitX96: 0n,
            },
          ],
        });

        const [amountOut] = result.result as [bigint, bigint, number, bigint];
        const amountOutFormatted = formatUnits(amountOut, decimalsOut);

        setQuote({
          amountOut: amountOutFormatted,
          priceImpact: 0.05,
          fee: '0.3%',
        });
      } catch (e) {
        console.error('Quote error:', e);
        setQuote(null);
      } finally {
        setLoading(false);
      }
    };

    const timeout = setTimeout(fetchQuote, 500);
    return () => clearTimeout(timeout);
  }, [tokenIn, tokenOut, amountIn]);

  return { quote, loading };
}
