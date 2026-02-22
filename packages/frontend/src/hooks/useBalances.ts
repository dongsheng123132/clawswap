import { useState, useCallback } from 'react';
import { usePublicClient } from 'wagmi';
import { formatUnits, parseAbi, type Address } from 'viem';
import { MONAD_CONTRACTS } from '@/lib/chains';
import { useSmartWallet } from './useSmartWallet';

const ERC20_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
]);

export function useBalances() {
  const publicClient = usePublicClient();
  const { address } = useSmartWallet();
  const [mon, setMon] = useState<string>('0');
  const [usdc, setUsdc] = useState<string>('0');
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!address || !publicClient) {
      setMon('0');
      setUsdc('0');
      return;
    }
    setLoading(true);
    try {
      const [monBalance, usdcBalance] = await Promise.all([
        publicClient.getBalance({ address: address as Address }),
        publicClient
          .readContract({
            address: MONAD_CONTRACTS.USDC as Address,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [address as Address],
          })
          .catch(() => BigInt(0)),
      ]);
      setMon(formatUnits(monBalance, 18));
      setUsdc(formatUnits(usdcBalance as bigint, 6));
    } catch {
      setMon('0');
      setUsdc('0');
    } finally {
      setLoading(false);
    }
  }, [address, publicClient]);

  const monNum = parseFloat(mon) || 0;
  const usdcNum = parseFloat(usdc) || 0;
  const totalUsd = usdcNum + monNum * 0.4;

  return {
    mon: monNum,
    usdc: usdcNum,
    totalUsd,
    loading,
    refresh,
    formatted: { mon, usdc },
  };
}
