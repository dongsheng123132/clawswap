import { prisma } from './db';
import { emitAgentEvent } from './agent-events';
import {
  CONTRACTS,
  getQuote,
  symbolToAddress,
  symbolToDecimals,
  SWAP_ROUTER_ABI,
} from './monad';
import { getAgentWallet, ensureApproval, getAgentBalances } from './agent-wallet';
import { parseUnits, formatUnits, formatEther } from 'viem';

// ===== Types =====
interface DCAConfig {
  amountPerInterval: number;
  intervalMs: number;
  tokenOutSymbol: string;
  capSingle?: number;
  capDaily?: number;
  validDays?: number;
}

interface AgentState {
  sessionId: string;
  userId: string;
  privyUserId: string;
  lastExecTime: number;
  dailySpent: number;
  dailyResetDate: string;
  tradeCount: number;
}

// ===== In-memory state =====
const agentStates = new Map<string, AgentState>();
let intervalId: ReturnType<typeof setInterval> | null = null;

// ===== Main Loop =====

export function startAgentRunner(pollIntervalMs: number = 15000) {
  if (process.env.VERCEL) {
    console.log('[AgentRunner] Running on Vercel — using Cron Job instead of setInterval');
    return;
  }
  if (intervalId) return;
  console.log('[AgentRunner] Starting with poll interval', pollIntervalMs, 'ms');
  intervalId = setInterval(runCycle, pollIntervalMs);
  runCycle();
}

export function stopAgentRunner() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  agentStates.clear();
  console.log('[AgentRunner] Stopped');
}

async function runCycle() {
  try {
    const activeSessions = await prisma.agentSession.findMany({
      where: {
        status: 'active',
        strategyType: { not: null },
        validUntil: { gt: new Date() },
      },
      include: {
        user: true,
      },
    });

    for (const session of activeSessions) {
      try {
        await processSession(session);
      } catch (e) {
        console.error(`[AgentRunner] Error processing session ${session.id}:`, e);
      }
    }
  } catch (e) {
    console.error('[AgentRunner] Cycle error:', e);
  }
}

async function processSession(session: {
  id: string;
  userId: string;
  strategyType: string | null;
  strategyConfig: string | null;
  user: { privyUserId: string };
}) {
  const config = session.strategyConfig ? JSON.parse(session.strategyConfig) : null;
  if (!config) return;

  let state = agentStates.get(session.id);
  if (!state) {
    state = {
      sessionId: session.id,
      userId: session.userId,
      privyUserId: session.user.privyUserId,
      lastExecTime: 0,
      dailySpent: 0,
      dailyResetDate: today(),
      tradeCount: 0,
    };
    agentStates.set(session.id, state);
  }

  if (state.dailyResetDate !== today()) {
    state.dailySpent = 0;
    state.dailyResetDate = today();
  }

  if (session.strategyType === 'DCA') {
    await executeDCA(session, config as DCAConfig, state);
  }
}

async function executeDCA(
  session: { id: string; userId: string },
  config: DCAConfig,
  state: AgentState
) {
  const now = Date.now();
  const intervalMs = config.intervalMs || 3600000;

  if (now - state.lastExecTime < intervalMs) {
    return;
  }

  const capDaily = config.capDaily ?? Infinity;
  if (state.dailySpent >= capDaily) {
    emitAgentEvent(state.privyUserId, {
      type: 'skip',
      msg: `日上限已达 (${state.dailySpent}/${capDaily} USDC)，今日跳过`,
      timestamp: now,
    });
    return;
  }

  const amount = Math.min(
    config.amountPerInterval || 10,
    config.capSingle ?? 100,
    capDaily - state.dailySpent
  );

  const tokenOutSymbol = config.tokenOutSymbol || 'MON';
  const tokenIn = CONTRACTS.USDC;
  const tokenOut = symbolToAddress(tokenOutSymbol);
  if (!tokenOut) {
    emitAgentEvent(state.privyUserId, {
      type: 'error',
      msg: `未知代币: ${tokenOutSymbol}`,
      timestamp: now,
    });
    return;
  }

  const amountInWei = parseUnits(amount.toString(), 6);
  const quote = await getQuote(tokenIn, tokenOut, amountInWei);

  if (!quote) {
    emitAgentEvent(state.privyUserId, {
      type: 'error',
      msg: '报价失败，跳过本次执行',
      timestamp: now,
    });
    return;
  }

  const decimalsOut = symbolToDecimals(tokenOutSymbol);
  const amountOutFormatted = formatUnits(quote.amountOut, decimalsOut);

  let agentBalances: { mon: bigint; usdc: bigint };
  try {
    agentBalances = await getAgentBalances();
  } catch (e) {
    emitAgentEvent(state.privyUserId, {
      type: 'error',
      msg: `Agent 钱包初始化失败: ${(e as Error).message}`,
      timestamp: now,
    });
    return;
  }

  if (agentBalances.usdc < amountInWei) {
    emitAgentEvent(state.privyUserId, {
      type: 'error',
      msg: `Agent USDC 不足: 需要 ${amount}，余额 ${formatUnits(agentBalances.usdc, 6)}`,
      timestamp: now,
    });
    return;
  }

  if (agentBalances.mon < parseUnits('0.01', 18)) {
    emitAgentEvent(state.privyUserId, {
      type: 'error',
      msg: `Agent MON 不足以付 gas: ${formatEther(agentBalances.mon)} MON`,
      timestamp: now,
    });
    return;
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
  } catch (e: any) {
    console.error('[AgentRunner] Swap failed:', e);
    txHash = `FAILED-${Date.now()}`;
    status = 'failed';

    emitAgentEvent(state.privyUserId, {
      type: 'error',
      msg: `交易失败: ${e?.shortMessage || e?.message || '未知错误'}`,
      timestamp: now,
    });

    try {
      await prisma.trade.create({
        data: {
          userId: state.userId,
          strategy: 'DCA',
          tokenIn: 'USDC',
          tokenOut: tokenOutSymbol,
          amountIn: amount.toString(),
          amountOut: '0',
          txHash,
          status: 'failed',
          reason: `DCA 失败: ${e?.shortMessage || e?.message || '未知'}`,
        },
      });
    } catch (_) {}

    state.lastExecTime = now;
    return;
  }

  try {
    await prisma.trade.create({
      data: {
        userId: state.userId,
        strategy: 'DCA',
        tokenIn: 'USDC',
        tokenOut: tokenOutSymbol,
        amountIn: amount.toString(),
        amountOut: amountOutFormatted,
        txHash,
        status,
        reason: `DCA 定投 — 每 ${intervalMs / 60000} 分钟买入 ${amount} USDC 的 ${tokenOutSymbol}`,
      },
    });
  } catch (e) {
    console.error('[AgentRunner] Failed to write trade:', e);
  }

  state.lastExecTime = now;
  state.dailySpent += amount;
  state.tradeCount += 1;

  const explorerUrl = `https://testnet.monadexplorer.com/tx/${txHash}`;
  emitAgentEvent(state.privyUserId, {
    type: 'trade',
    msg: `✅ 买入 ${amount} USDC → ${Number(amountOutFormatted).toFixed(4)} ${tokenOutSymbol} | tx: ${txHash.slice(0, 10)}...`,
    trade: {
      tokenIn: 'USDC',
      tokenOut: tokenOutSymbol,
      amountIn: amount.toString(),
      amountOut: amountOutFormatted,
      txHash,
      explorerUrl,
      status,
    },
    timestamp: now,
  });

  console.log(
    `[AgentRunner] DCA: ${amount} USDC → ${amountOutFormatted} ${tokenOutSymbol} | tx: ${txHash}`
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
