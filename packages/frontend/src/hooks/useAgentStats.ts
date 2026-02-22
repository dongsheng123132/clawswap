import { useState, useEffect, useCallback } from 'react';
import { getApiUrl } from '@/lib/api';

export interface Trade {
  id: string;
  strategy: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  txHash: string;
  status: string;
  createdAt: string;
}

export interface AgentStats {
  tradeCount: number;
  totalSpent: number;
  totalReceived: number;
  avgPrice: number;
  trades: Trade[];
}

export function useAgentStats(userId: string | undefined) {
  const [stats, setStats] = useState<AgentStats>({
    tradeCount: 0,
    totalSpent: 0,
    totalReceived: 0,
    avgPrice: 0,
    trades: [],
  });
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch(
        getApiUrl(`/api/v1/agent/history?userId=${encodeURIComponent(userId)}`)
      );
      if (!res.ok) return;
      const data = await res.json();
      const trades: Trade[] = data.trades || [];

      const dcaTrades = trades.filter((t) => t.strategy === 'DCA');
      const totalSpent = dcaTrades.reduce((sum, t) => sum + Number(t.amountIn), 0);
      const totalReceived = dcaTrades.reduce((sum, t) => sum + Number(t.amountOut), 0);
      const avgPrice = totalReceived > 0 ? totalSpent / totalReceived : 0;

      setStats({
        tradeCount: dcaTrades.length,
        totalSpent,
        totalReceived,
        avgPrice,
        trades,
      });
    } catch (e) {
      console.error('Failed to fetch agent stats:', e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30000);
    return () => clearInterval(id);
  }, [refresh]);

  return { stats, loading, refresh };
}
