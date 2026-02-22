import { ensureAgentRunnerStarted } from '@/lib/agent-runner-init';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

ensureAgentRunnerStarted();

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const userId = new URL(request.url).searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId (query param)' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { privyUserId: userId },
      include: {
        sessions: {
          where: { status: 'active' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!user) {
      return NextResponse.json({
        running: false,
        session: null,
        strategyType: null,
        strategyConfig: null,
      });
    }

    const session = user.sessions[0] ?? null;
    const running = session != null && session.status === 'active';

    return NextResponse.json({
      running,
      session: session
        ? {
            id: session.id,
            agentAddress: session.agentAddress,
            status: session.status,
            validUntil: session.validUntil.toISOString(),
          }
        : null,
      strategyType: session?.strategyType ?? null,
      strategyConfig: session?.strategyConfig
        ? (() => {
            try {
              return JSON.parse(session.strategyConfig);
            } catch {
              return null;
            }
          })()
        : null,
    });
  } catch (error) {
    console.error('Status error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
