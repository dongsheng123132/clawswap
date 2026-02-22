import { useEffect, useRef, useCallback, useState } from 'react';
import { getApiUrl } from '@/lib/api';

export type AgentStreamEvent = {
  type?: string;
  text?: string;
  at?: string;
  msg?: string;
  [key: string]: unknown;
};

export function useAgentStream(userId: string | undefined, onEvent?: (event: AgentStreamEvent) => void) {
  const [events, setEvents] = useState<AgentStreamEvent[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      disconnect();
      return;
    }
    const url = getApiUrl(`/api/v1/agent/stream?userId=${encodeURIComponent(userId)}`);
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as AgentStreamEvent;
        setEvents((prev) => [data, ...prev].slice(0, 100));
        onEvent?.(data);
      } catch (_) {
        // heartbeat or non-JSON
      }
    };

    es.onerror = () => {
      disconnect();
    };

    return () => disconnect();
  }, [userId, onEvent, disconnect]);

  return { events, disconnect };
}
