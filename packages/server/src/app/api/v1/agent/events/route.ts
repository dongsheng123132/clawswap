import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userIdParam = searchParams.get('userId');
    const sinceParam = searchParams.get('since');

    if (!userIdParam) {
      return NextResponse.json({ error: 'Missing userId (query param)' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { privyUserId: userIdParam },
    });
    if (!user) {
      return NextResponse.json({ events: [] });
    }

    const since = sinceParam ? new Date(sinceParam) : undefined;
    const events = await prisma.agentEvent.findMany({
      where: {
        userId: user.id,
        ...(since ? { createdAt: { gt: since } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const list = events.map((e) => ({
      id: e.id,
      type: e.type,
      data: (() => {
        try {
          return JSON.parse(e.data) as Record<string, unknown>;
        } catch {
          return { raw: e.data };
        }
      })(),
      createdAt: e.createdAt.toISOString(),
    }));

    return NextResponse.json({ events: list });
  } catch (e) {
    console.error('[Agent/Events] Error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
