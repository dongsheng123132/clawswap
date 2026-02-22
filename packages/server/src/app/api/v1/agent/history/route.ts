import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

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
    });
    if (!user) {
      return NextResponse.json({ trades: [] });
    }

    const trades = await prisma.trade.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json({ trades });
  } catch (error) {
    console.error('History error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
