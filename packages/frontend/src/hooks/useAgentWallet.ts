import { useState, useEffect } from 'react';
import { getApiUrl } from '@/lib/api';

export interface AgentWalletInfo {
  address: string;
  balances: { mon: string; usdc: string };
  explorerUrl: string;
}

export function useAgentWallet() {
  const [info, setInfo] = useState<AgentWalletInfo | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(getApiUrl('/api/v1/agent/wallet'));
        if (res.ok) setInfo(await res.json());
      } catch (_) {}
    };
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);

  return { info };
}
