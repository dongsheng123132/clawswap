import { prisma } from './db';

/**
 * In-memory event bus for Agent SSE streams.
 * Maps userId (privyUserId) -> Set of (data: string) => void callbacks.
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

export function emitAgentEvent(privyUserId: string, event: Record<string, unknown>): void {
  const data = JSON.stringify(event);
  userStreams.get(privyUserId)?.forEach((send) => {
    try {
      send(data);
    } catch (_) {}
  });

  // Persist to DB for Vercel polling (fire-and-forget)
  prisma.user
    .findUnique({ where: { privyUserId } })
    .then((user) => {
      if (!user) return;
      return prisma.agentEvent.create({
        data: {
          userId: user.id,
          type: (event.type as string) || 'event',
          data,
        },
      });
    })
    .catch((e) => console.error('[AgentEvents] DB write failed:', e));
}
