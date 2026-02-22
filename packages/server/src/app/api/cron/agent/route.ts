import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { emitAgentEvent } from '@/lib/agent-events';
import {
  CONTRACTS,
  getQuote,
  symbolToAddress,
  symbolToDecimals,
  SWAP_ROUTER_ABI,
} from '@/lib/monad';
import { getAgentWallet, ensureApproval, getAgentBalances } from '@/lib/agent-wallet';
import { parseUnits, formatUnits, formatEther } from 'viem';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function verifyCronSecret(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET) return true;
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const activeSessions = await prisma.agentSession.findMany({
      where: {
        status: 'active',
        strategyType: { not: null },
        validUntil: { gt: new Date() },
      },
      include: { user: true },
    });

    const results: Array<{ sessionId: string; result: string }> = [];

    for (const session of activeSessions) {
      try {
        const r = await processSession(session);
        results.push({ sessionId: session.id, result: r });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        results.push({ sessionId: session.id, result: `error: ${msg}` });
      }
    }

    return NextResponse.json({
      ok: true,
      processed: activeSessions.length,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[Cron/Agent] Error:', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function processSession(session: {
  id: string;
  userId: string;
  strategyType: string | null;
  strategyConfig: string | null;
  user: { privyUserId: string };
}): Promise<string> {
  if (session.strategyType !== 'DCA') return 'skip: not DCA';

  const config = session.strategyConfig ? JSON.parse(session.strategyConfig) : null;
  if (!config) return 'skip: no config';

  const lastTrade = await prisma.trade.findFirst({
    where: { userId: session.userId, strategy: 'DCA' },
    orderBy: { createdAt: 'desc' },
  });

  const intervalMs = config.intervalMs || 3600000;
  if (lastTrade) {
    const elapsed = Date.now() - lastTrade.createdAt.getTime();
    if (elapsed < intervalMs) {
      return `skip: interval not reached (${Math.round(elapsed / 1000)}s / ${Math.round(intervalMs / 1000)}s)`;
    }
  }

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayTrades = await prisma.trade.findMany({
    where: {
      userId: session.userId,
      strategy: 'DCA',
      status: 'confirmed',
      createdAt: { gte: todayStart },
    },
  });
  const dailySpent = todayTrades.reduce((s, t) => s + Number(t.amountIn), 0);
  const capDaily = config.capDaily ?? Infinity;
  if (dailySpent >= capDaily) {
    return `skip: daily cap reached (${dailySpent}/${capDaily})`;
  }

  const amount = Math.min(
    config.amountPerInterval || 10,
    config.capSingle ?? 100,
    capDaily - dailySpent
  );

  const tokenOutSymbol = config.tokenOutSymbol || 'MON';
  const tokenIn = CONTRACTS.USDC;
  const tokenOut = symbolToAddress(tokenOutSymbol);
  if (!tokenOut) return `error: unknown token ${tokenOutSymbol}`;

  const amountInWei = parseUnits(amount.toString(), 6);
  const quote = await getQuote(tokenIn, tokenOut, amountInWei);
  if (!quote) return 'error: quote failed';

  const decimalsOut = symbolToDecimals(tokenOutSymbol);
  const amountOutFormatted = formatUnits(quote.amountOut, decimalsOut);

  let agentBalances: { mon: bigint; usdc: bigint };
  try {
    agentBalances = await getAgentBalances();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return `error: wallet init failed: ${msg}`;
  }

  if (agentBalances.usdc < amountInWei) {
    return `error: insufficient USDC (need ${amount}, have ${formatUnits(agentBalances.usdc, 6)})`;
  }
  if (agentBalances.mon < parseUnits('0.01', 18)) {
    return `error: insufficient MON for gas (${formatEther(agentBalances.mon)})`;
  }

  let txHash: string;
  let status: string;

  try {
    const { walletClient, publicClient, address } = getAgentWallet();
    await ensureApproval(CONTRACTS.USDC, CONTRACTS.SWAP_ROUTER, amountInWei);

    const slippageBps = 50n;
    const amountOutMinimum = (quote.amountOut * (10000n - slippageBps)) / 10000n;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

    const hash = await walletClient.writeContract({
      address: CONTRACTS.SWAP_ROUTER,
      abi: SWAP_ROUTER_ABI,
      functionName: 'exactInputSingle',
      args: [
        {
          tokenIn,
          tokenOut,
          fee: 3000,
          recipient: address,
          deadline,
          amountIn: amountInWei,
          amountOutMinimum,
          sqrtPriceLimitX96: 0n,
        },
      ],
      account: walletClient.account!,
      chain: walletClient.chain!,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    txHash = receipt.transactionHash;
    status = receipt.status === 'success' ? 'confirmed' : 'failed';
  } catch (e: unknown) {
    const err = e as { shortMessage?: string; message?: string };
    const msg = err.shortMessage ?? (e instanceof Error ? e.message : String(e));
    await prisma.trade.create({
      data: {
        userId: session.userId,
        strategy: 'DCA',
        tokenIn: 'USDC',
        tokenOut: tokenOutSymbol,
        amountIn: amount.toString(),
        amountOut: '0',
        txHash: `FAILED-${Date.now()}`,
        status: 'failed',
        reason: msg,
      },
    });
    return `error: swap failed: ${msg}`;
  }

  await prisma.trade.create({
    data: {
      userId: session.userId,
      strategy: 'DCA',
      tokenIn: 'USDC',
      tokenOut: tokenOutSymbol,
      amountIn: amount.toString(),
      amountOut: amountOutFormatted,
      txHash,
      status,
      reason: `DCA — ${amount} USDC → ${tokenOutSymbol}`,
    },
  });

  emitAgentEvent(session.user.privyUserId, {
    type: 'trade',
    msg: `✅ 买入 ${amount} USDC → ${Number(amountOutFormatted).toFixed(4)} ${tokenOutSymbol}`,
    trade: {
      tokenIn: 'USDC',
      tokenOut: tokenOutSymbol,
      amountIn: amount.toString(),
      amountOut: amountOutFormatted,
      txHash,
      explorerUrl: `https://testnet.monadexplorer.com/tx/${txHash}`,
      status,
    },
    timestamp: Date.now(),
  });

  return `ok: ${amount} USDC → ${amountOutFormatted} ${tokenOutSymbol} | tx: ${txHash}`;
}
