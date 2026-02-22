# ClawSwap — Vercel 部署适配

> **目标**: 将项目从本地开发环境适配为 Vercel Serverless 部署架构。
>
> **核心变更**:
> 1. Prisma SQLite → Neon PostgreSQL
> 2. AgentRunner setInterval → Vercel Cron Jobs
> 3. SSE 内存事件总线 → 数据库轮询 (polling)
> 4. 添加 `vercel.json` 配置
> 5. Monorepo 两个项目分别部署

---

## Prompt 1: Prisma 迁移 SQLite → Neon PostgreSQL

### 背景
当前数据库是 SQLite (`file:./prisma/dev.db`)，Vercel Serverless 不支持持久化本地文件。
用户已在 Vercel 上创建了 Neon PostgreSQL 数据库。

### 要改的文件

**`packages/server/prisma/schema.prisma`** — 将 provider 从 sqlite 改为 postgresql:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id                 String   @id @default(cuid())
  privyUserId        String   @unique
  email              String?
  twitterHandle      String?
  smartWalletAddress String?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  sessions AgentSession[]
  trades   Trade[]
}

model AgentSession {
  id                   String    @id @default(cuid())
  userId               String
  user                 User      @relation(fields: [userId], references: [id])
  serializedSessionKey String    @db.Text
  privateKeyEncrypted  String?   @db.Text
  agentAddress         String?
  status               String    @default("active")
  strategyType         String?
  strategyConfig       String?   @db.Text
  validUntil           DateTime
  createdAt            DateTime  @default(now())
  revokedAt            DateTime?
}

model Trade {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  strategy  String
  tokenIn   String
  tokenOut  String
  amountIn  String
  amountOut String
  txHash    String
  status    String
  reason    String?  @db.Text
  createdAt DateTime @default(now())
}

model ApiCallLog {
  id         String   @id @default(cuid())
  endpoint   String
  paidAmount String?
  createdAt  DateTime @default(now())
}
```

**变更要点**:
- `provider = "postgresql"` (原来是 `"sqlite"`)
- 长文本字段加 `@db.Text`: `serializedSessionKey`, `privateKeyEncrypted`, `strategyConfig`, `reason`
- 其他字段不变，`cuid()` 和 `DateTime` 在 PostgreSQL 下直接兼容

**`packages/server/src/lib/db.ts`** — 不需要改，当前 singleton 模式已经适配 Vercel:

```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

**`packages/server/package.json`** — 修改 build 脚本:

```json
{
  "scripts": {
    "build": "prisma generate && prisma db push --accept-data-loss && next build",
    "postinstall": "prisma generate"
  }
}
```

加 `postinstall` 是因为 Vercel 安装依赖后需要生成 Prisma Client。
加 `prisma db push` 是自动同步 schema 到数据库（首次部署时创建表）。

**`.env.example`** — 更新 DATABASE_URL 格式:

```
# Database (Neon PostgreSQL for Vercel)
DATABASE_URL="postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/clawswap?sslmode=require"
```

### 验证
改完后在本地执行:
```bash
# 先设好 DATABASE_URL 指向你的 Neon 连接字符串
cd packages/server
npx prisma db push
npx prisma studio  # 打开浏览器确认表已创建
npm run build       # 确认构建通过
```

---

## Prompt 2: AgentRunner 改为 Vercel Cron Job

### 背景
当前 `agent-runner.ts` 使用 `setInterval(runCycle, 30000)` 轮询，这在 Vercel Serverless 上不可行：
- Serverless 函数执行完就销毁，`setInterval` 无效
- 函数最长超时 60 秒 (Hobby) / 300 秒 (Pro)
- 内存状态 (agentStates Map) 每次冷启动会丢失

**解决方案**: 用 Vercel Cron Jobs 定时触发一个 API route 来执行 DCA 周期。

### 要改的文件

**1. 新建 `packages/server/src/app/api/cron/agent/route.ts`**:

```typescript
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
export const maxDuration = 60; // 最长执行 60 秒

// Vercel Cron 安全验证
function verifyCronSecret(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET) return true; // 开发模式跳过
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
      } catch (e: any) {
        results.push({ sessionId: session.id, result: `error: ${e.message}` });
      }
    }

    return NextResponse.json({
      ok: true,
      processed: activeSessions.length,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error('[Cron/Agent] Error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
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

  // 检查上次执行时间 — 从数据库 Trade 记录推算（无需内存状态）
  const lastTrade = await prisma.trade.findFirst({
    where: {
      userId: session.userId,
      strategy: 'DCA',
    },
    orderBy: { createdAt: 'desc' },
  });

  const intervalMs = config.intervalMs || 3600000;
  if (lastTrade) {
    const elapsed = Date.now() - lastTrade.createdAt.getTime();
    if (elapsed < intervalMs) {
      return `skip: interval not reached (${Math.round(elapsed / 1000)}s / ${Math.round(intervalMs / 1000)}s)`;
    }
  }

  // 检查日上限
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

  // 检查余额
  let agentBalances: { mon: bigint; usdc: bigint };
  try {
    agentBalances = await getAgentBalances();
  } catch (e: any) {
    return `error: wallet init failed: ${e.message}`;
  }

  if (agentBalances.usdc < amountInWei) {
    return `error: insufficient USDC (need ${amount}, have ${formatUnits(agentBalances.usdc, 6)})`;
  }
  if (agentBalances.mon < parseUnits('0.01', 18)) {
    return `error: insufficient MON for gas (${formatEther(agentBalances.mon)})`;
  }

  // 执行 swap
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
      args: [{
        tokenIn,
        tokenOut,
        fee: 3000,
        recipient: address,
        deadline,
        amountIn: amountInWei,
        amountOutMinimum,
        sqrtPriceLimitX96: 0n,
      }],
      account: walletClient.account!,
      chain: walletClient.chain!,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    txHash = receipt.transactionHash;
    status = receipt.status === 'success' ? 'confirmed' : 'failed';
  } catch (e: any) {
    // 交易失败也记录
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
        reason: e?.shortMessage || e?.message || 'unknown',
      },
    });
    return `error: swap failed: ${e?.shortMessage || e?.message}`;
  }

  // 记录成功交易
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

  // 推送事件
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
```

**2. 修改 `packages/server/src/lib/agent-runner.ts`** — 保留但改为可选:

```typescript
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

// ===== In-memory state (本地开发用) =====
let intervalId: ReturnType<typeof setInterval> | null = null;

export function startAgentRunner(pollIntervalMs: number = 15000) {
  // 仅本地开发时启用 setInterval 模式
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
  console.log('[AgentRunner] Stopped');
}

// ... runCycle 和 executeDCA 保持不变（本地开发用）...
```

关键改动：`startAgentRunner()` 里检查 `process.env.VERCEL`，在 Vercel 上不启动轮询。

**3. 修改 `packages/server/src/lib/agent-runner-init.ts`**:

```typescript
import { startAgentRunner } from './agent-runner';

let initialized = false;

export function ensureAgentRunnerStarted() {
  if (initialized) return;
  initialized = true;
  // Vercel 上由 Cron Job 触发，不需要 setInterval
  if (process.env.VERCEL) return;
  startAgentRunner(30000);
}
```

**4. `packages/server/vercel.json`**（新建）:

```json
{
  "crons": [
    {
      "path": "/api/cron/agent",
      "schedule": "*/1 * * * *"
    }
  ]
}
```

每 1 分钟触发一次。Cron Job 内部会检查每个 session 的 `intervalMs` 来决定是否真的执行。

**注意**: Vercel Hobby 计划 Cron 最小间隔是 1 天，Pro 计划才支持每分钟。
如果是 Hobby 计划，改为 `"schedule": "0 * * * *"`（每小时）或直接用前端手动触发按钮。

### 环境变量
在 Vercel Dashboard 添加:
```
CRON_SECRET=<随机字符串>   # Vercel 自动设置，或手动配
```

---

## Prompt 3: SSE 事件总线改为数据库轮询

### 背景
当前 `agent-events.ts` 使用内存 Map 存储 SSE 订阅回调。在 Vercel 上：
- 每个请求可能运行在不同实例，内存不共享
- Cron Job 写的事件，SSE 流读不到
- SSE 连接最长 55 秒超时

**解决方案**:
1. Agent 事件写入数据库 (AgentEvent 表)
2. 前端改为 HTTP 短轮询 (每 5 秒 GET 最新事件)
3. 保留 SSE 作为可选（本地开发用）

### 要改的文件

**1. `packages/server/prisma/schema.prisma`** — 新增 AgentEvent 模型:

在 schema 末尾添加:
```prisma
model AgentEvent {
  id        String   @id @default(cuid())
  userId    String
  type      String
  data      String   @db.Text
  createdAt DateTime @default(now())

  @@index([userId, createdAt])
}
```

`@@index` 加速按用户 + 时间查询。

**2. `packages/server/src/lib/agent-events.ts`** — 双写：内存 + 数据库:

```typescript
import { prisma } from './db';

// 内存事件总线（本地开发 SSE 用）
const userStreams = new Map<string, Set<(data: string) => void>>();

export function subscribeAgentStream(userId: string, send: (data: string) => void): () => void {
  if (!userStreams.has(userId)) userStreams.set(userId, new Set());
  userStreams.get(userId)!.add(send);
  return () => {
    userStreams.get(userId)?.delete(send);
    if (userStreams.get(userId)?.size === 0) userStreams.delete(userId);
  };
}

export function emitAgentEvent(userId: string, event: Record<string, unknown>): void {
  const data = JSON.stringify(event);

  // 1. 内存推送（本地 SSE）
  userStreams.get(userId)?.forEach((send) => {
    try { send(data); } catch (_) {}
  });

  // 2. 持久化到数据库（Vercel 用）
  prisma.agentEvent.create({
    data: {
      userId,
      type: (event.type as string) || 'info',
      data,
    },
  }).catch((e) => console.error('[AgentEvents] DB write failed:', e));
}
```

**3. 新建 `packages/server/src/app/api/v1/agent/events/route.ts`** — HTTP 轮询端点:

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  const since = url.searchParams.get('since'); // ISO timestamp

  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  const where: any = { userId };
  if (since) {
    where.createdAt = { gt: new Date(since) };
  }

  const events = await prisma.agentEvent.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    take: 50,
  });

  return NextResponse.json({
    events: events.map((e) => ({
      id: e.id,
      type: e.type,
      ...JSON.parse(e.data),
      createdAt: e.createdAt.toISOString(),
    })),
  });
}
```

**4. `packages/frontend/src/hooks/useAgentStream.ts`** — 改为 HTTP 轮询:

找到当前的 `useAgentStream` hook，改为:

```typescript
import { useState, useEffect, useRef, useCallback } from 'react';
import { getApiUrl } from '@/lib/api';

export interface AgentStreamEvent {
  type: string;
  msg?: string;
  text?: string;
  trade?: {
    txHash?: string;
    explorerUrl?: string;
    amountIn?: string;
    amountOut?: string;
    tokenIn?: string;
    tokenOut?: string;
    status?: string;
  };
  timestamp?: number;
  createdAt?: string;
}

export function useAgentStream(userId: string | undefined, enabled: boolean) {
  const [events, setEvents] = useState<AgentStreamEvent[]>([]);
  const sinceRef = useRef<string | null>(null);

  const poll = useCallback(async () => {
    if (!userId || !enabled) return;
    try {
      const params = new URLSearchParams({ userId });
      if (sinceRef.current) params.set('since', sinceRef.current);

      const res = await fetch(getApiUrl(`/api/v1/agent/events?${params}`));
      if (!res.ok) return;
      const data = await res.json();
      const newEvents: AgentStreamEvent[] = data.events || [];

      if (newEvents.length > 0) {
        setEvents((prev) => [...prev, ...newEvents]);
        // 记录最新事件时间，下次只拉增量
        sinceRef.current = newEvents[newEvents.length - 1].createdAt || new Date().toISOString();
      }
    } catch (e) {
      console.error('[useAgentStream] poll error:', e);
    }
  }, [userId, enabled]);

  useEffect(() => {
    if (!userId || !enabled) return;

    // 立即拉一次
    poll();
    // 每 5 秒轮询
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [userId, enabled, poll]);

  const clear = useCallback(() => {
    setEvents([]);
    sinceRef.current = null;
  }, []);

  return { events, clear };
}
```

**5. 更新 `AgentTab.tsx`** 里使用 `useAgentStream` 的地方:

当前 `AgentTab` 用 `useAgentStream` 返回的 `streamEvents`，只需确认:
- `const { events: streamEvents, clear: clearStream } = useAgentStream(userId, isRunning);`
- 名称对应上就行，之前的逻辑无需大改

---

## Prompt 4: Vercel 部署配置

### 要新建/修改的文件

**1. `packages/server/vercel.json`**（如果 Prompt 2 已建则合并）:

```json
{
  "framework": "nextjs",
  "crons": [
    {
      "path": "/api/cron/agent",
      "schedule": "*/1 * * * *"
    }
  ]
}
```

**2. `packages/frontend/vercel.json`**（新建）:

```json
{
  "framework": "nextjs"
}
```

**3. `packages/server/next.config.mjs`** — 添加 CORS headers:

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: process.env.FRONTEND_URL || '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
    ];
  },
};

export default nextConfig;
```

**4. 更新 `.env.example`**:

```
# === Vercel 部署用 ===

# Database — Neon PostgreSQL 连接字符串 (从 Vercel Dashboard 获取)
DATABASE_URL="postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/clawswap?sslmode=require"

# Monad Testnet
MONAD_RPC_URL=https://testnet-rpc.monad.xyz

# Agent 钱包私钥 (DCA 执行用)
PRIVATE_KEY=

# Privy
NEXT_PUBLIC_PRIVY_APP_ID=
PRIVY_APP_SECRET=

# ZeroDev AA 钱包
NEXT_PUBLIC_ZERODEV_PROJECT_ID=

# x402
X402_FACILITATOR_URL=https://x402-facilitator.molandak.org

# Vercel Cron 安全密钥 (Vercel 自动设置)
CRON_SECRET=

# Frontend → Server API URL
# frontend 项目里配置，值为 server 部署后的 URL
NEXT_PUBLIC_API_URL=https://clawswap-server.vercel.app

# Server 允许的前端域名 (CORS)
FRONTEND_URL=https://clawswap-frontend.vercel.app
```

---

## Prompt 5: 前端适配

### 背景
前端部署为独立 Vercel 项目，需要确保:
1. `NEXT_PUBLIC_API_URL` 指向 server 部署 URL
2. SSE 替换为轮询（已在 Prompt 3 完成）
3. 构建不报错

### 检查清单（无需写新代码，只需确认）

1. `packages/frontend/src/lib/api.ts` — 已正确读取 `NEXT_PUBLIC_API_URL`，不用改
2. `packages/frontend/next.config.mjs` — 已有 webpack fallback for `@zerodev/webauthn-key`，不用改
3. `packages/frontend/tsconfig.json` — 已有 `"target": "es2020"`，不用改

### 唯一需要改的

`packages/frontend/src/app/components/tabs/SwapTab.tsx` — 底部的 mock 数据改为从 API 拉取:

把 `MOCK_RECENT_TRADES` 删除，改为：
```typescript
// 最近交易从 agent history API 获取（复用 useAgentStats）
```

或者保留 mock 数据也行（纯 UI 展示），不影响部署。这个改不改都无所谓。

---

## 部署步骤 (给用户的操作指南)

### 1. Neon 数据库
- 在 Vercel Dashboard → Storage → 创建 Neon PostgreSQL
- 复制连接字符串 (DATABASE_URL)

### 2. Vercel 项目配置
在 Vercel Dashboard 创建两个项目，都连接同一个 GitHub 仓库:

**项目 A: clawswap-server**
- Root Directory: `packages/server`
- Framework: Next.js
- Build Command: `npm run build` (即 `prisma generate && prisma db push --accept-data-loss && next build`)
- Environment Variables:
  - `DATABASE_URL` = Neon 连接字符串
  - `PRIVATE_KEY` = Agent 钱包私钥
  - `NEXT_PUBLIC_PRIVY_APP_ID` = Privy App ID
  - `PRIVY_APP_SECRET` = Privy Secret
  - `MONAD_RPC_URL` = `https://testnet-rpc.monad.xyz`
  - `FRONTEND_URL` = (部署 frontend 后填)

**项目 B: clawswap-frontend**
- Root Directory: `packages/frontend`
- Framework: Next.js
- Build Command: `npm run build`
- Install Command: `npm install --legacy-peer-deps`
- Environment Variables:
  - `NEXT_PUBLIC_API_URL` = server 部署后的 URL (如 `https://clawswap-server.vercel.app`)
  - `NEXT_PUBLIC_PRIVY_APP_ID` = Privy App ID
  - `NEXT_PUBLIC_ZERODEV_PROJECT_ID` = ZeroDev Project ID

### 3. 部署顺序
1. 先部署 server → 拿到 URL
2. 再部署 frontend → `NEXT_PUBLIC_API_URL` 填 server URL
3. 回到 server → `FRONTEND_URL` 填 frontend URL → 重新部署

### 4. 验证
- `https://clawswap-server.vercel.app/api/v1/health` → 返回 `{"status":"ok"}`
- `https://clawswap-server.vercel.app/api/v1/quote?tokenIn=USDC&tokenOut=MON&amountIn=10` → 返回报价
- 打开 frontend → 登录 → Swap 页面看到余额
- 打开 Agent → 启动 DCA → 等 Cron 触发 → 看到交易记录

---

## 本地验证 Vercel 兼容性

在写代码之前，用以下命令本地验证:

```bash
# 1. 设置 Neon DATABASE_URL
export DATABASE_URL="postgresql://..."

# 2. 推送 schema
cd packages/server
npx prisma db push

# 3. 模拟 Vercel 环境构建
VERCEL=1 npm run build

# 4. 手动触发 Cron endpoint
curl http://localhost:3005/api/cron/agent

# 5. 测试事件轮询
curl "http://localhost:3005/api/v1/agent/events?userId=test"
```

---

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `packages/server/prisma/schema.prisma` | 修改 | sqlite→postgresql, 加 @db.Text, 加 AgentEvent 模型 |
| `packages/server/package.json` | 修改 | build 加 db push, 加 postinstall |
| `packages/server/src/app/api/cron/agent/route.ts` | 新建 | Cron Job 触发 DCA 执行 |
| `packages/server/src/app/api/v1/agent/events/route.ts` | 新建 | HTTP 轮询事件端点 |
| `packages/server/src/lib/agent-events.ts` | 修改 | 事件同时写内存+数据库 |
| `packages/server/src/lib/agent-runner.ts` | 修改 | Vercel 上跳过 setInterval |
| `packages/server/src/lib/agent-runner-init.ts` | 修改 | Vercel 上跳过初始化 |
| `packages/server/next.config.mjs` | 修改 | 加 CORS headers |
| `packages/server/vercel.json` | 新建 | Cron 配置 |
| `packages/frontend/vercel.json` | 新建 | 框架配置 |
| `packages/frontend/src/hooks/useAgentStream.ts` | 修改 | SSE→HTTP 轮询 |
| `.env.example` | 修改 | 更新为 Vercel 格式 |
