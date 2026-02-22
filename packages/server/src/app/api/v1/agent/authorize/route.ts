import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      userId,
      serializedSessionKey,
      privateKey,
      agentAddress,
      strategyType,
      strategyConfig,
      validUntil,
      smartWalletAddress,
    } = body;

    if (!userId || !serializedSessionKey) {
      return NextResponse.json(
        { error: 'Missing userId or serializedSessionKey' },
        { status: 400 }
      );
    }

    const validUntilDate = validUntil
      ? new Date(typeof validUntil === 'number' ? validUntil * 1000 : validUntil)
      : new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = await prisma.user.upsert({
      where: { privyUserId: userId },
      create: {
        privyUserId: userId,
        smartWalletAddress: smartWalletAddress ?? null,
      },
      update: smartWalletAddress ? { smartWalletAddress } : {},
    });

    await prisma.agentSession.create({
      data: {
        userId: user.id,
        serializedSessionKey,
        privateKeyEncrypted: privateKey ?? null,
        agentAddress: agentAddress ?? null,
        strategyType: strategyType ?? null,
        strategyConfig:
          strategyConfig != null ? JSON.stringify(strategyConfig) : null,
        validUntil: validUntilDate,
        status: 'active',
      },
    });

    return NextResponse.json({ success: true, message: 'Agent authorized' });
  } catch (error) {
    console.error('Authorization error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
