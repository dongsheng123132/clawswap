import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = body.userId ?? new URL(request.url).searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId (body or query)' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { privyUserId: userId },
    });
    if (!user) {
      return NextResponse.json({ success: true, message: 'No session to revoke' });
    }

    const now = new Date();
    await prisma.agentSession.updateMany({
      where: { userId: user.id, status: 'active' },
      data: { status: 'revoked', revokedAt: now },
    });

    return NextResponse.json({ success: true, message: 'Agent revoked' });
  } catch (error) {
    console.error('Revoke error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
