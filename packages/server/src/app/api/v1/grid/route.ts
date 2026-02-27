import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const GRID_SIZE = 9; // 3x3

// Lazy-init: seed 9 cells on first request
async function ensureCellsExist() {
  const count = await prisma.gridCell.count();
  if (count >= GRID_SIZE) return;

  const existing = await prisma.gridCell.findMany({ select: { index: true } });
  const existingSet = new Set(existing.map((c) => c.index));

  const toCreate = [];
  for (let i = 0; i < GRID_SIZE; i++) {
    if (!existingSet.has(i)) {
      toCreate.push({ index: i, price: '0.01', color: '#7C3AED' });
    }
  }

  if (toCreate.length > 0) {
    await prisma.gridCell.createMany({ data: toCreate });
  }
}

export const GET = async () => {
  try {
    await ensureCellsExist();

    const cells = await prisma.gridCell.findMany({
      orderBy: { index: 'asc' },
    });

    return NextResponse.json({ cells });
  } catch (e: any) {
    console.error('GET /grid error:', e);
    return NextResponse.json(
      { error: e?.message || 'Internal error' },
      { status: 500 }
    );
  }
};
