# ClawSwap Phase 2 — Cursor Prompts

> Phase 1 已完成: Prisma + DB、Agent API 端点、SSE 事件总线、useAgent/useAgentStream hooks、AgentTab/EarnTab 接入真实 API
>
> Phase 2 目标: **让 Agent 真正能在链上交易**。包含 4 个 Prompt，按顺序执行。

---

## Prompt 1: 统一合约地址 + 真实链上报价

### 任务说明

当前项目有 3 个地方定义了合约地址，其中 `demo/src/lib/monad.ts` 的地址是已验证在 Monad Testnet 上可用的正确地址，其他两处是错误的旧地址。需要统一所有地址并实现真实的链上报价功能。

### 需要修改的文件

#### 1.1 修改 `packages/server/src/lib/monad.ts`

替换为以下完整内容:

```typescript
import {
  createPublicClient,
  http,
  defineChain,
  parseAbi,
  formatUnits,
  formatEther,
  type Address,
} from "viem";

// ============ Monad Testnet Chain ============
export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testnet-rpc.monad.xyz"] },
  },
  blockExplorers: {
    default: {
      name: "Monad Explorer",
      url: "https://testnet.monadexplorer.com",
    },
  },
  testnet: true,
});

// ============ Contract Addresses ============
// Uniswap V3 on Monad Testnet (verified working)
export const CONTRACTS = {
  WMON: "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A" as Address,
  USDC: "0x534b2f3A21130d7a60830c2Df862319e593943A3" as Address,
  UNISWAP_FACTORY: "0x204faca1764b154221e35c0d20abb3c525710498" as Address,
  SWAP_ROUTER: "0xfe31f71c1b106eac32f1a19239c9a9a72ddfb900" as Address,
  QUOTER_V2: "0x661e93cca42afacb172121ef892830ca3b70f08d" as Address,
  POSITION_MANAGER: "0x7197e214c0b767cfb76fb734ab638e2c192f4e53" as Address,
} as const;

// 兼容旧代码的别名
export const MONAD_CONTRACTS = {
  USDC: CONTRACTS.USDC,
  WMON: CONTRACTS.WMON,
  SwapRouter: CONTRACTS.SWAP_ROUTER,
  Quoter: CONTRACTS.QUOTER_V2,
  Factory: CONTRACTS.UNISWAP_FACTORY,
  NonfungiblePositionManager: CONTRACTS.POSITION_MANAGER,
} as const;

// ============ ABIs ============
export const ERC20_ABI = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

// 重要: QuoterV2 使用 struct 参数格式，不是展开的参数
export const QUOTER_V2_ABI = parseAbi([
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]);

// 重要: SwapRouter 也使用 struct 参数格式
export const SWAP_ROUTER_ABI = parseAbi([
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)",
]);

// ============ Public Client ============
export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(),
});

// ============ Helper Functions ============

export async function getBalances(address: Address) {
  const [monBalance, usdcBalance] = await Promise.all([
    publicClient.getBalance({ address }),
    publicClient.readContract({
      address: CONTRACTS.USDC,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address],
    }),
  ]);

  return {
    mon: formatEther(monBalance),
    usdc: formatUnits(usdcBalance, 6),
    monRaw: monBalance,
    usdcRaw: usdcBalance,
  };
}

export async function getQuote(
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  fee: number = 3000
): Promise<{ amountOut: bigint; gasEstimate: bigint } | null> {
  try {
    const result = await publicClient.simulateContract({
      address: CONTRACTS.QUOTER_V2,
      abi: QUOTER_V2_ABI,
      functionName: "quoteExactInputSingle",
      args: [
        {
          tokenIn,
          tokenOut,
          amountIn,
          fee,
          sqrtPriceLimitX96: 0n,
        },
      ],
    });
    const [amountOut, , , gasEstimate] = result.result as [bigint, bigint, number, bigint];
    return { amountOut, gasEstimate };
  } catch {
    return null;
  }
}

/** 获取 1 MON 的 USDC 价格 */
export async function getMonPrice(): Promise<number | null> {
  const oneWmon = 10n ** 18n; // 1 WMON
  const quote = await getQuote(CONTRACTS.WMON, CONTRACTS.USDC, oneWmon);
  if (!quote) return null;
  return Number(formatUnits(quote.amountOut, 6));
}

/** 符号 → 地址映射 */
export function symbolToAddress(symbol: string): Address | null {
  const s = symbol.toUpperCase();
  if (s === "MON" || s === "WMON") return CONTRACTS.WMON;
  if (s === "USDC") return CONTRACTS.USDC;
  return null;
}

/** 符号 → 精度映射 */
export function symbolToDecimals(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s === "MON" || s === "WMON") return 18;
  if (s === "USDC") return 6;
  return 18;
}
```

#### 1.2 修改 `packages/agent/src/wallet/chains.ts`

替换为以下内容（和 server 的 monad.ts 保持一致的地址）:

```typescript
import { defineChain, type Address } from 'viem';

export const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { decimals: 18, name: 'Monad', symbol: 'MON' },
  rpcUrls: {
    default: { http: ['https://testnet-rpc.monad.xyz'] },
  },
  blockExplorers: {
    default: { name: 'Monad Explorer', url: 'https://testnet.monadexplorer.com' },
  },
  testnet: true,
});

export const CONTRACTS = {
  WMON: "0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A" as Address,
  USDC: "0x534b2f3A21130d7a60830c2Df862319e593943A3" as Address,
  UNISWAP_FACTORY: "0x204faca1764b154221e35c0d20abb3c525710498" as Address,
  SWAP_ROUTER: "0xfe31f71c1b106eac32f1a19239c9a9a72ddfb900" as Address,
  QUOTER_V2: "0x661e93cca42afacb172121ef892830ca3b70f08d" as Address,
  POSITION_MANAGER: "0x7197e214c0b767cfb76fb734ab638e2c192f4e53" as Address,
} as const;

// 兼容旧代码
export const MONAD_CONTRACTS = {
  USDC: CONTRACTS.USDC,
  WMON: CONTRACTS.WMON,
  SwapRouter: CONTRACTS.SWAP_ROUTER,
  Quoter: CONTRACTS.QUOTER_V2,
  Factory: CONTRACTS.UNISWAP_FACTORY,
  NonfungiblePositionManager: CONTRACTS.POSITION_MANAGER,
} as const;
```

#### 1.3 修改 `packages/frontend/src/lib/chains.ts`

同理，替换合约地址为正确地址（保持和上面一样的 CONTRACTS + MONAD_CONTRACTS 导出）。

#### 1.4 修改 `packages/server/src/app/api/v1/quote/route.ts`

把 mock getQuote 替换为真实链上报价:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getX402, PAY_TO_ADDRESS } from '@/lib/x402-server';
import { CONTRACTS, getQuote, symbolToAddress, symbolToDecimals } from '@/lib/monad';
import { prisma } from '@/lib/db';
import { parseUnits, formatUnits, formatEther } from 'viem';

export const GET = async (req: NextRequest) => {
  // --- x402 payment validation (keep existing logic) ---
  let x402;
  try {
    x402 = getX402();
  } catch {
    // x402 not configured — skip payment for now (dev mode)
  }

  if (x402) {
    const paymentOptions = {
      recipient: PAY_TO_ADDRESS,
      amount: '0.0001',
      token: CONTRACTS.USDC,
      chainId: 10143,
    };
    const { isAuthorized, paymentError, headers } = await x402.validateRequest(req, paymentOptions);
    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Payment Required', details: paymentError },
        { status: 402, headers }
      );
    }
    try {
      await prisma.apiCallLog.create({
        data: { endpoint: '/api/v1/quote', paidAmount: paymentOptions.amount },
      });
    } catch (_) {}
  }

  // --- Business Logic: Real on-chain quote ---
  const searchParams = req.nextUrl.searchParams;
  const tokenInSymbol = searchParams.get('tokenIn');
  const tokenOutSymbol = searchParams.get('tokenOut');
  const amountInStr = searchParams.get('amountIn');

  if (!tokenInSymbol || !tokenOutSymbol || !amountInStr) {
    return NextResponse.json({ error: 'Missing parameters: tokenIn, tokenOut, amountIn' }, { status: 400 });
  }

  const tokenIn = symbolToAddress(tokenInSymbol);
  const tokenOut = symbolToAddress(tokenOutSymbol);
  if (!tokenIn || !tokenOut) {
    return NextResponse.json({ error: `Unknown token symbol. Supported: USDC, MON/WMON` }, { status: 400 });
  }

  const decimalsIn = symbolToDecimals(tokenInSymbol);
  const decimalsOut = symbolToDecimals(tokenOutSymbol);

  let amountInWei: bigint;
  try {
    amountInWei = parseUnits(amountInStr, decimalsIn);
  } catch {
    return NextResponse.json({ error: 'Invalid amountIn' }, { status: 400 });
  }

  const quote = await getQuote(tokenIn, tokenOut, amountInWei);
  if (!quote) {
    return NextResponse.json({ error: 'Quote failed — pool may not exist or have insufficient liquidity' }, { status: 502 });
  }

  const amountOutFormatted = formatUnits(quote.amountOut, decimalsOut);

  return NextResponse.json({
    tokenIn: tokenInSymbol,
    tokenOut: tokenOutSymbol,
    amountIn: amountInStr,
    amountOut: amountOutFormatted,
    amountOutRaw: quote.amountOut.toString(),
    estimatedGas: quote.gasEstimate.toString(),
    dex: 'Uniswap V3 (Monad)',
    fee: '0.3%',
    priceImpact: 0.1, // TODO: calculate from sqrtPriceX96
  });
};
```

#### 1.5 修改 `packages/server/src/app/api/v1/swap/route.ts`

替换 mock 为真实 swap calldata 构建:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getX402, PAY_TO_ADDRESS } from '@/lib/x402-server';
import { CONTRACTS, SWAP_ROUTER_ABI, getQuote, symbolToAddress, symbolToDecimals } from '@/lib/monad';
import { prisma } from '@/lib/db';
import { parseUnits, encodeFunctionData, type Address } from 'viem';

export const POST = async (req: NextRequest) => {
  // --- x402 payment validation ---
  let x402;
  try {
    x402 = getX402();
  } catch {}

  if (x402) {
    const paymentOptions = {
      recipient: PAY_TO_ADDRESS,
      amount: '0.001',
      token: CONTRACTS.USDC,
      chainId: 10143,
    };
    const { isAuthorized, paymentError, headers } = await x402.validateRequest(req, paymentOptions);
    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Payment Required', details: paymentError },
        { status: 402, headers }
      );
    }
    try {
      await prisma.apiCallLog.create({
        data: { endpoint: '/api/v1/swap', paidAmount: paymentOptions.amount },
      });
    } catch (_) {}
  }

  // --- Business Logic: Build real swap calldata ---
  try {
    const body = await req.json();
    const { tokenIn: tokenInSymbol, tokenOut: tokenOutSymbol, amountIn: amountInStr, walletAddress, slippage = 0.5 } = body;

    if (!tokenInSymbol || !tokenOutSymbol || !amountInStr || !walletAddress) {
      return NextResponse.json({ error: 'Missing: tokenIn, tokenOut, amountIn, walletAddress' }, { status: 400 });
    }

    const tokenIn = symbolToAddress(tokenInSymbol);
    const tokenOut = symbolToAddress(tokenOutSymbol);
    if (!tokenIn || !tokenOut) {
      return NextResponse.json({ error: 'Unknown token symbol' }, { status: 400 });
    }

    const decimalsIn = symbolToDecimals(tokenInSymbol);
    const amountInWei = parseUnits(amountInStr, decimalsIn);

    // Get quote first
    const quote = await getQuote(tokenIn, tokenOut, amountInWei);
    if (!quote) {
      return NextResponse.json({ error: 'Quote failed' }, { status: 502 });
    }

    // Calculate minimum output with slippage
    const slippageBps = BigInt(Math.floor(slippage * 100)); // 0.5% → 50 bps
    const amountOutMinimum = quote.amountOut * (10000n - slippageBps) / 10000n;

    // Build swap calldata
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800); // 30 minutes

    const data = encodeFunctionData({
      abi: SWAP_ROUTER_ABI,
      functionName: 'exactInputSingle',
      args: [{
        tokenIn,
        tokenOut,
        fee: 3000,
        recipient: walletAddress as Address,
        deadline,
        amountIn: amountInWei,
        amountOutMinimum,
        sqrtPriceLimitX96: 0n,
      }],
    });

    // If tokenIn is WMON and user is paying with native MON, value = amountIn
    const isNativeIn = tokenIn.toLowerCase() === CONTRACTS.WMON.toLowerCase();

    return NextResponse.json({
      txData: {
        to: CONTRACTS.SWAP_ROUTER,
        data,
        value: isNativeIn ? amountInWei.toString() : '0',
        chainId: 10143,
      },
      quote: {
        amountOut: quote.amountOut.toString(),
        amountOutMinimum: amountOutMinimum.toString(),
        estimatedGas: quote.gasEstimate.toString(),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
};
```

#### 1.6 修改 `packages/frontend/src/hooks/useQuote.ts`

替换 mock 为调用 server 的真实 quote API（注意：前端报价是免费的，不走 x402）:

```typescript
import { useState, useEffect } from 'react';
import {
  createPublicClient,
  http,
  parseUnits,
  formatUnits,
  formatEther,
  parseAbi,
  type Address,
} from 'viem';
import { MONAD_CONTRACTS } from '@/lib/chains';

const monadClient = createPublicClient({
  chain: {
    id: 10143,
    name: 'Monad Testnet',
    nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
    rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } },
  } as any,
  transport: http('https://testnet-rpc.monad.xyz'),
});

const QUOTER_V2_ABI = parseAbi([
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]);

// 符号 → 地址
function symbolToAddress(symbol: string): Address | null {
  const s = symbol.toUpperCase();
  if (s === 'MON' || s === 'WMON') return MONAD_CONTRACTS.WMON as Address;
  if (s === 'USDC') return MONAD_CONTRACTS.USDC as Address;
  return null;
}

function symbolToDecimals(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s === 'MON' || s === 'WMON') return 18;
  if (s === 'USDC') return 6;
  return 18;
}

export function useQuote(tokenIn: string, tokenOut: string, amountIn: string) {
  const [quote, setQuote] = useState<{
    amountOut: string;
    priceImpact: number;
    fee: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!amountIn || amountIn === '0' || Number(amountIn) <= 0) {
      setQuote(null);
      return;
    }

    const fetchQuote = async () => {
      setLoading(true);
      try {
        const addrIn = symbolToAddress(tokenIn);
        const addrOut = symbolToAddress(tokenOut);
        if (!addrIn || !addrOut) {
          setQuote(null);
          return;
        }

        const decimalsIn = symbolToDecimals(tokenIn);
        const decimalsOut = symbolToDecimals(tokenOut);
        const amountInWei = parseUnits(amountIn, decimalsIn);

        const result = await monadClient.simulateContract({
          address: MONAD_CONTRACTS.Quoter as Address,
          abi: QUOTER_V2_ABI,
          functionName: 'quoteExactInputSingle',
          args: [{
            tokenIn: addrIn,
            tokenOut: addrOut,
            amountIn: amountInWei,
            fee: 3000,
            sqrtPriceLimitX96: 0n,
          }],
        });

        const [amountOut] = result.result as [bigint, bigint, number, bigint];
        const amountOutFormatted = formatUnits(amountOut, decimalsOut);

        setQuote({
          amountOut: amountOutFormatted,
          priceImpact: 0.05,
          fee: '0.3%',
        });
      } catch (e) {
        console.error('Quote error:', e);
        setQuote(null);
      } finally {
        setLoading(false);
      }
    };

    const timeout = setTimeout(fetchQuote, 500);
    return () => clearTimeout(timeout);
  }, [tokenIn, tokenOut, amountIn]);

  return { quote, loading };
}
```

### 验证方法

修改完成后，启动前端 `cd packages/frontend && npm run dev`，打开 Swap 页面，输入 `1` USDC → MON，应该能看到真实的链上报价数字（而不是之前的 mock `amountIn * 0.99`）。如果报价返回 null 说明 QuoterV2 调用失败，检查合约地址和 ABI 是否匹配。

---

## Prompt 2: Agent 执行循环 — 真实 DCA 策略

### 任务说明

当前 Agent 的 DCA 策略 `evaluate()` 方法是空的。需要实现完整的 DCA 执行循环：
1. 从 DB 读取 active 的 AgentSession 和策略配置
2. 检查是否到了执行时间
3. 调用 QuoterV2 获取真实报价
4. 构建 swap 交易 calldata
5. 通过 Session Key 签名并发送 UserOperation
6. 记录 Trade 到数据库
7. 通过 SSE 发送事件到前端

**由于 Session Key 尚未完全实现（仍用 sudoPolicy），此 Prompt 先在 server 端实现 Agent 循环逻辑，用 "模拟执行" 模式——不实际发送链上交易，但会读取真实报价、写入 Trade 记录、发送 SSE 事件。等 Session Key 实现后再接入真正的 sendTransaction。**

### 需要创建/修改的文件

#### 2.1 创建 `packages/server/src/lib/agent-runner.ts`

这是 Agent 后台执行引擎的核心文件：

```typescript
import { prisma } from './db';
import { emitAgentEvent } from './agent-events';
import {
  CONTRACTS,
  getQuote,
  getMonPrice,
  symbolToAddress,
  symbolToDecimals,
  publicClient,
} from './monad';
import { parseUnits, formatUnits, formatEther, type Address } from 'viem';

// ===== Types =====
interface DCAConfig {
  amountPerInterval: number;   // e.g. 10 (USDC)
  intervalMs: number;          // e.g. 3600000 (1 hour)
  tokenOutSymbol: string;      // e.g. "MON"
  capSingle?: number;          // max per trade
  capDaily?: number;           // max per day
  validDays?: number;
}

interface AgentState {
  sessionId: string;
  userId: string;         // prisma user.id
  privyUserId: string;    // privy user id for SSE
  lastExecTime: number;   // timestamp ms
  dailySpent: number;     // USDC spent today
  dailyResetDate: string; // "YYYY-MM-DD"
  tradeCount: number;
}

// ===== In-memory state =====
const agentStates = new Map<string, AgentState>();
let intervalId: NodeJS.Timeout | null = null;

// ===== Main Loop =====

export function startAgentRunner(pollIntervalMs: number = 15000) {
  if (intervalId) return;
  console.log('[AgentRunner] Starting with poll interval', pollIntervalMs, 'ms');
  intervalId = setInterval(runCycle, pollIntervalMs);
  // Run immediately
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
    // Find all active sessions with DCA strategy
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

async function processSession(session: any) {
  const config = session.strategyConfig ? JSON.parse(session.strategyConfig) : null;
  if (!config) return;

  // Get or create agent state
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

  // Reset daily counter if new day
  if (state.dailyResetDate !== today()) {
    state.dailySpent = 0;
    state.dailyResetDate = today();
  }

  if (session.strategyType === 'DCA') {
    await executeDCA(session, config as DCAConfig, state);
  }
  // TODO: Add StopLoss strategy handling
}

async function executeDCA(session: any, config: DCAConfig, state: AgentState) {
  const now = Date.now();
  const intervalMs = config.intervalMs || 3600000;

  // Check if it's time to execute
  if (now - state.lastExecTime < intervalMs) {
    return; // Not time yet
  }

  // Check daily cap
  const capDaily = config.capDaily || Infinity;
  if (state.dailySpent >= capDaily) {
    emitAgentEvent(state.privyUserId, {
      type: 'skip',
      msg: `日上限已达 (${state.dailySpent}/${capDaily} USDC)，今日跳过`,
      timestamp: now,
    });
    return;
  }

  // Check single cap
  const amount = Math.min(
    config.amountPerInterval || 10,
    (config.capSingle || 100),
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

  // Get real quote from chain
  const amountInWei = parseUnits(amount.toString(), 6); // USDC has 6 decimals
  const quote = await getQuote(tokenIn, tokenOut, amountInWei);

  if (!quote) {
    emitAgentEvent(state.privyUserId, {
      type: 'error',
      msg: `报价失败，跳过本次执行`,
      timestamp: now,
    });
    return;
  }

  const decimalsOut = symbolToDecimals(tokenOutSymbol);
  const amountOutFormatted = formatUnits(quote.amountOut, decimalsOut);

  // ============================================
  // TODO: 实际发送链上交易
  // 当 Session Key 完成后，在这里:
  // 1. approve USDC to SwapRouter (如果 allowance 不足)
  // 2. 调用 exactInputSingle
  // 3. 等待交易确认
  // 现在先用模拟模式
  // ============================================

  const txHash = `0x${Date.now().toString(16)}${'0'.repeat(40)}`; // 模拟 tx hash
  const simulated = true;

  // Write Trade record to DB
  try {
    await prisma.trade.create({
      data: {
        userId: state.userId,
        strategy: 'DCA',
        tokenIn: 'USDC',
        tokenOut: tokenOutSymbol,
        amountIn: amount.toString(),
        amountOut: amountOutFormatted,
        txHash: simulated ? `SIM-${txHash}` : txHash,
        status: simulated ? 'simulated' : 'confirmed',
        reason: `DCA 定投 — 每 ${intervalMs / 60000} 分钟买入 ${amount} USDC 的 ${tokenOutSymbol}`,
      },
    });
  } catch (e) {
    console.error('[AgentRunner] Failed to write trade:', e);
  }

  // Update state
  state.lastExecTime = now;
  state.dailySpent += amount;
  state.tradeCount += 1;

  // Emit SSE event
  emitAgentEvent(state.privyUserId, {
    type: 'trade',
    msg: `✅ 买入 ${amount} USDC → ${Number(amountOutFormatted).toFixed(4)} ${tokenOutSymbol}${simulated ? ' (模拟)' : ''}`,
    trade: {
      tokenIn: 'USDC',
      tokenOut: tokenOutSymbol,
      amountIn: amount.toString(),
      amountOut: amountOutFormatted,
      txHash: simulated ? `SIM-${txHash}` : txHash,
      simulated,
    },
    timestamp: now,
  });

  console.log(
    `[AgentRunner] DCA executed: ${amount} USDC → ${amountOutFormatted} ${tokenOutSymbol} (simulated=${simulated})`
  );
}

// Helper
function today(): string {
  return new Date().toISOString().slice(0, 10);
}
```

#### 2.2 创建 `packages/server/src/lib/agent-runner-init.ts`

在 Next.js server 启动时自动初始化 Agent Runner:

```typescript
import { startAgentRunner } from './agent-runner';

// 这个文件的作用是确保 AgentRunner 在 server 启动时运行
// 在 Next.js 中，我们可以在某个 API route 的顶层 import 它，或者在 layout.tsx server 组件中 import

let initialized = false;

export function ensureAgentRunnerStarted() {
  if (initialized) return;
  initialized = true;
  // 在 demo 模式下每 30 秒检查一次（生产环境可以改为 15 秒）
  startAgentRunner(30000);
}
```

#### 2.3 修改 `packages/server/src/app/api/v1/agent/status/route.ts`

在 status 端点顶部 import agent-runner-init 来确保 runner 启动:

在文件最顶部（`import { NextResponse }` 之前）添加:

```typescript
import { ensureAgentRunnerStarted } from '@/lib/agent-runner-init';
ensureAgentRunnerStarted();
```

这样当前端第一次轮询 status 时就会启动 Agent Runner。

#### 2.4 修改 `packages/server/src/app/api/v1/agent/history/route.ts`

确保 history 端点返回的 trades 包含新增的模拟交易。查看当前代码，如果它已经在从 DB 查询 Trade 就不用改。如果没有，改为:

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const userId = new URL(request.url).searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

### 验证方法

1. 启动 server: `cd packages/server && npm run dev`
2. 在前端选择 DCA 策略，配置每分钟买 1 USDC 的 MON，点击启动 Agent
3. 在 Agent "运行中" 面板应该能看到 SSE 推送的事件日志
4. 等 30 秒后 Agent Runner 会执行第一次 DCA
5. 检查日志: 应该看到 `[AgentRunner] DCA executed: 1 USDC → X.XXXX MON (simulated=true)`
6. 检查 Trade 记录: 调用 `/api/v1/agent/history?userId=xxx` 应该返回新的 trade 记录

---

## Prompt 3: SwapTab 接入真实交易

### 任务说明

当前 `SwapTab.tsx` 的 `handleSwap()` 只是 setTimeout 模拟。需要:
1. 接入真实余额显示
2. handleSwap 通过 AA 钱包发送真实交易

### 需要修改的文件

#### 3.1 修改 `packages/frontend/src/app/components/tabs/SwapTab.tsx`

主要改动:
1. 引入 `useBalances` hook 替换 `const balanceIn = 0`
2. 引入 `useSmartWallet` hook
3. `handleSwap()` 中调用 server 的 `/api/v1/swap` 获取 calldata，然后通过 kernelClient 发送交易

```typescript
// 在文件顶部添加 import:
import { useBalances } from '@/hooks/useBalances';
import { useSmartWallet } from '@/hooks/useSmartWallet';
import { getApiUrl } from '@/lib/api';

// 在组件内部替换:
// 旧: const balanceIn = 0; const balanceOut = 0;
// 新:
const { mon, usdc, refresh: refreshBalances } = useBalances();
const { kernelClient, address: walletAddress } = useSmartWallet();
const balanceIn = tokenIn === 'USDC' ? usdc : mon;
const balanceOut = tokenOut === 'USDC' ? usdc : mon;

// useEffect 初始加载余额
useEffect(() => { refreshBalances(); }, [refreshBalances]);

// 替换 handleSwap:
const handleSwap = async () => {
  if (!kernelClient || !walletAddress) {
    setSwapToast('done');
    setTimeout(() => setSwapToast(null), 2000);
    return;
  }

  setSwapToast('sending');
  try {
    // 1. 如果是 USDC → MON，需要先 approve
    // (可选: 检查 allowance，如果不够就先 approve)
    // TODO: 实现 approve 逻辑

    // 2. 调用 server 获取 swap calldata
    const res = await fetch(getApiUrl('/api/v1/swap'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokenIn,
        tokenOut,
        amountIn,
        walletAddress,
        slippage: 0.5,
      }),
    });

    if (!res.ok) throw new Error('Failed to get swap data');
    const { txData } = await res.json();

    setSwapToast('confirming');

    // 3. 通过 AA 钱包发送交易
    const hash = await kernelClient.sendTransaction({
      to: txData.to,
      data: txData.data,
      value: BigInt(txData.value || '0'),
    });

    console.log('Swap tx:', hash);
    setSwapToast('done');
    refreshBalances();
    setTimeout(() => setSwapToast(null), 2000);
  } catch (e) {
    console.error('Swap error:', e);
    setSwapToast('done');
    setTimeout(() => setSwapToast(null), 2000);
  }
};
```

注意: 由于 ZeroDev AA 钱包可能还没有完全在 Monad testnet 上配置好（需要 bundler + paymaster），swap 可能会在 `sendTransaction` 步骤失败。这是预期的，等 ZeroDev 配置完成后就能正常工作。优先确保 **quote 是真实的、calldata 构建是正确的**。

### 验证方法

1. 打开 Swap 页面
2. 输入金额应该看到真实链上报价
3. 余额应该显示真实的 MON/USDC 余额
4. 点击 Swap — 如果 ZeroDev 已配置，交易会上链；否则会在 console 看到错误，这是正常的

---

## Prompt 4: Agent 运行面板显示真实数据

### 任务说明

当前 AgentTab 的 "运行中" 面板 (`view === 'running'`) 显示的是硬编码的 mock 数据（"已执行: 12 次"、"平均买入价: 0.398"等）。需要从 server API 获取真实的交易历史来计算这些数据。

### 需要修改的文件

#### 4.1 创建 `packages/frontend/src/hooks/useAgentStats.ts`

```typescript
import { useState, useEffect, useCallback } from 'react';
import { getApiUrl } from '@/lib/api';

interface Trade {
  id: string;
  strategy: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  txHash: string;
  status: string;
  createdAt: string;
}

interface AgentStats {
  tradeCount: number;
  totalSpent: number;       // USDC
  totalReceived: number;    // tokenOut (e.g. MON)
  avgPrice: number;         // USDC per MON
  trades: Trade[];
}

export function useAgentStats(userId: string | undefined) {
  const [stats, setStats] = useState<AgentStats>({
    tradeCount: 0,
    totalSpent: 0,
    totalReceived: 0,
    avgPrice: 0,
    trades: [],
  });
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch(getApiUrl(`/api/v1/agent/history?userId=${encodeURIComponent(userId)}`));
      if (!res.ok) return;
      const data = await res.json();
      const trades: Trade[] = data.trades || [];

      const dcaTrades = trades.filter(t => t.strategy === 'DCA');
      const totalSpent = dcaTrades.reduce((sum, t) => sum + Number(t.amountIn), 0);
      const totalReceived = dcaTrades.reduce((sum, t) => sum + Number(t.amountOut), 0);
      const avgPrice = totalReceived > 0 ? totalSpent / totalReceived : 0;

      setStats({
        tradeCount: dcaTrades.length,
        totalSpent,
        totalReceived,
        avgPrice,
        trades,
      });
    } catch (e) {
      console.error('Failed to fetch agent stats:', e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30000); // 每 30 秒刷新
    return () => clearInterval(id);
  }, [refresh]);

  return { stats, loading, refresh };
}
```

#### 4.2 修改 `packages/frontend/src/app/components/tabs/AgentTab.tsx`

在 `AgentTab` 组件中:

1. 添加 import:
```typescript
import { useAgentStats } from '@/hooks/useAgentStats';
```

2. 在组件内部添加:
```typescript
const { stats, refresh: refreshStats } = useAgentStats(userId);
```

3. 在 `handleStartAgent` 成功后添加 `refreshStats()`:
```typescript
if (success) {
  await refreshStatus();
  refreshStats();
  // ... rest
}
```

4. 替换 "运行中" 面板中的硬编码数据:

找到这段:
```
<p className="text-zinc-500">已执行: 12 次 | 已花费: 120 USDC</p>
<p className="text-zinc-500">平均买入价: 0.398 USDC/MON</p>
<p className="text-[#22C55E] mt-1">当前价格: 0.412 USDC/MON +3.5%</p>
```

替换为:
```tsx
<p className="text-zinc-500">
  已执行: {stats.tradeCount} 次 | 已花费: {stats.totalSpent.toFixed(2)} USDC
</p>
<p className="text-zinc-500">
  买到: {stats.totalReceived.toFixed(4)} {dcaToken}
</p>
{stats.avgPrice > 0 && (
  <p className="text-zinc-500">
    平均买入价: {stats.avgPrice.toFixed(6)} USDC/{dcaToken}
  </p>
)}
```

同样替换持仓汇总中的硬编码:
```
<p>MON: 312.5 个 (≈ $128.75)</p>
<p className="text-zinc-500">成本: 120 USDC | 盈亏: +$8.75 (+7.3%)</p>
```

替换为:
```tsx
<p>{dcaToken}: {stats.totalReceived.toFixed(4)} 个</p>
<p className="text-zinc-500">
  成本: {stats.totalSpent.toFixed(2)} USDC
</p>
```

### 验证方法

1. 启动 Agent（DCA 策略）
2. 等 Agent Runner 执行几次 DCA
3. "运行中" 面板应该显示真实的交易次数、花费、买到的数量
4. SSE 日志应该实时显示每次交易

---

## 执行顺序总结

```
Prompt 1: 统一合约地址 + 真实链上报价
  ↓
Prompt 2: Agent 执行循环（DCA 策略，模拟模式）
  ↓
Prompt 3: SwapTab 接入真实交易
  ↓
Prompt 4: Agent 运行面板显示真实数据
```

每个 Prompt 完成后验证再进入下一个。Prompt 1 是基础，所有后续 Prompt 都依赖它。

---

## 之后的 Phase 3（可选）

完成 Phase 2 后可以继续:
- Session Key 权限收紧: `toSudoPolicy` → `toCallPolicy` + `toRateLimitPolicy`
- Agent 真实上链交易: 把 agent-runner.ts 中的 "模拟执行" 改为真实 sendTransaction
- x402 构建修复: 解决 @x402/core 的 export 问题
- 止盈止损策略: 实现 StopLoss 的 evaluate() 逻辑
