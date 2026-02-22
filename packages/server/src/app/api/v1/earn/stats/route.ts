import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function startOfMonth(d: Date) {
  const x = new Date(d);
  x.setUTCDate(1);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

export async function GET() {
  try {
    const now = new Date();
    const todayStart = startOfDay(now);
    const monthStart = startOfMonth(now);

    const all = await prisma.apiCallLog.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const today = all.filter((r) => r.createdAt >= todayStart);
    const monthly = all.filter((r) => r.createdAt >= monthStart);

    const sum = (arr: { paidAmount: string | null }[]) =>
      arr.reduce((acc, r) => acc + (r.paidAmount ? Number(r.paidAmount) : 0), 0);

    const byEndpoint = all.reduce<Record<string, { calls: number; paid: number }>>((acc, r) => {
      const ep = r.endpoint;
      if (!acc[ep]) acc[ep] = { calls: 0, paid: 0 };
      acc[ep].calls += 1;
      acc[ep].paid += r.paidAmount ? Number(r.paidAmount) : 0;
      return acc;
    }, {});

    const endpoints = Object.entries(byEndpoint).map(([endpoint, { calls, paid }]) => ({
      endpoint,
      calls,
      paid,
    }));

    return NextResponse.json({
      today: { calls: today.length, paid: sum(today) },
      monthly: { calls: monthly.length, paid: sum(monthly) },
      total: { calls: all.length, paid: sum(all) },
      endpoints,
    });
  } catch (error) {
    console.error('Earn stats error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
