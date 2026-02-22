/**
 * In-memory event bus for Agent SSE streams.
 * Maps userId -> Set of (data: string) => void callbacks.
 */
const userStreams = new Map<string, Set<(data: string) => void>>();

export function subscribeAgentStream(userId: string, send: (data: string) => void): () => void {
  if (!userStreams.has(userId)) userStreams.set(userId, new Set());
  userStreams.get(userId)!.add(send);
  return () => {
    userStreams.get(userId)?.delete(send);
    if (userStreams.get(userId)?.size === 0) userStreams.delete(userId);
  };
}

export function emitAgentEvent(userId: string, event: Record<string, unknown>): void {
  const data = JSON.stringify(event);
  userStreams.get(userId)?.forEach((send) => {
    try {
      send(data);
    } catch (_) {}
  });
}
