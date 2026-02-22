import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, strategyType, strategyConfig } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { privyUserId: userId },
    });
    if (!user) {
      return NextResponse.json(
        { error: 'User not found. Authorize agent first.' },
        { status: 404 }
      );
    }

    const active = await prisma.agentSession.findFirst({
      where: { userId: user.id, status: 'active' },
      orderBy: { createdAt: 'desc' },
    });

    if (!active) {
      return NextResponse.json(
        { error: 'No active agent session. Authorize first.' },
        { status: 404 }
      );
    }

    await prisma.agentSession.update({
      where: { id: active.id },
      data: {
        strategyType: strategyType ?? active.strategyType,
        strategyConfig:
          strategyConfig != null
            ? JSON.stringify(strategyConfig)
            : active.strategyConfig,
      },
    });

    const parsedConfig = active.strategyConfig
      ? (() => {
          try {
            return JSON.parse(active.strategyConfig);
          } catch {
            return null;
          }
        })()
      : null;
    return NextResponse.json({
      success: true,
      strategyType: strategyType ?? active.strategyType,
      strategyConfig: strategyConfig ?? parsedConfig,
    });
  } catch (error) {
    console.error('Strategy update error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
