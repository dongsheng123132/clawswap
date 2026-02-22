import { NextResponse } from 'next/server';
import { getAgentWallet, getAgentBalances } from '@/lib/agent-wallet';
import { formatUnits, formatEther } from 'viem';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { address } = getAgentWallet();
    const balances = await getAgentBalances();
    return NextResponse.json({
      address,
      balances: {
        mon: formatEther(balances.mon),
        usdc: formatUnits(balances.usdc, 6),
      },
      explorerUrl: `https://testnet.monadexplorer.com/address/${address}`,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || 'Agent wallet not configured' },
      { status: 503 }
    );
  }
}
