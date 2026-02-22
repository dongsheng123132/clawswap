import { useEffect, useRef, useCallback, useState } from 'react';
import { getApiUrl } from '@/lib/api';

export type AgentStreamEvent = {
  type?: string;
  text?: string;
  at?: string;
  msg?: string;
  [key: string]: unknown;
};

const POLL_INTERVAL_MS = 5000;

export function useAgentStream(
  userId: string | undefined,
  enabled: boolean = true,
  onEvent?: (event: AgentStreamEvent) => void
) {
  const [events, setEvents] = useState<AgentStreamEvent[]>([]);
  const sinceRef = useRef<string | undefined>(undefined);

  const fetchEvents = useCallback(async () => {
    if (!userId) return;
    const url = new URL(getApiUrl('/api/v1/agent/events'));
    url.searchParams.set('userId', userId);
    if (sinceRef.current) url.searchParams.set('since', sinceRef.current);
    const res = await fetch(url.toString());
    if (!res.ok) return;
    const json = (await res.json()) as { events?: Array<{ id: string; type: string; data: Record<string, unknown>; createdAt: string }> };
    const list = json.events ?? [];
    if (list.length === 0) return;
    const ordered = [...list].reverse();
    ordered.forEach((e) => {
      const ev = { ...e.data, type: e.type } as AgentStreamEvent;
      setEvents((prev) => {
        const next = [ev, ...prev].slice(0, 100);
        return next;
      });
      onEvent?.(ev);
    });
    const newest = list[0];
    if (newest?.createdAt) sinceRef.current = newest.createdAt;
  }, [userId, onEvent]);

  useEffect(() => {
    if (!userId || !enabled) return;
    fetchEvents();
    const t = setInterval(fetchEvents, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [userId, enabled, fetchEvents]);

  const disconnect = useCallback(() => {
    // No-op for polling; kept for API compatibility
  }, []);

  return { events, disconnect };
}
