import { useState, useCallback, useEffect } from 'react';
import { getApiUrl } from '@/lib/api';

export type AgentStatus = {
  running: boolean;
  session: {
    id: string;
    agentAddress: string | null;
    status: string;
    validUntil: string;
  } | null;
  strategyType: string | null;
  strategyConfig: Record<string, unknown> | null;
};

export function useAgent(userId: string | undefined) {
  const [status, setStatus] = useState<AgentStatus>({
    running: false,
    session: null,
    strategyType: null,
    strategyConfig: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(getApiUrl(`/api/v1/agent/status?userId=${encodeURIComponent(userId)}`));
      if (!res.ok) throw new Error('Failed to fetch status');
      const data = await res.json();
      setStatus({
        running: data.running ?? false,
        session: data.session ?? null,
        strategyType: data.strategyType ?? null,
        strategyConfig: data.strategyConfig ?? null,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, 15000);
    return () => clearInterval(t);
  }, [fetchStatus]);

  return {
    ...status,
    loading,
    error,
    refresh: fetchStatus,
  };
}
