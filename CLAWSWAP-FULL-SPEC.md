# ClawSwap 完整实现规范（v2 — 基于现有代码）

> **用途**：给 Cursor 的全栈实现文档。
> **关键**：本项目已有约 60-70% 的代码，本文档标注了每个模块的来源和状态。
> **标记说明**：
> - ✅ **直接搬** — 现有代码完整可用，复制到新项目即可
> - 🔧 **需补完** — 有框架/UI，但核心逻辑缺失，需要实现
> - 🆕 **新写** — 现有项目没有，需要从零实现

---

## 0. 产品总览

**ClawSwap** = 用户用 Twitter 登录 → 自动建 AA 钱包 → AI Agent 7×24 自动交易

### 赚钱闭环

```
用户 Twitter/Email 登录 → Privy 社交认证
    → 自动创建 AA 钱包 (ZeroDev Kernel, Paymaster 代付 gas)
    → 用户存入 USDC
    → 选策略: 定投 / 止盈止损 / 新币狙击 / 自然语言
    → 签发 Session Key → AI Agent 自动交易
    → 交易记录实时推送到 Dashboard
    → 用户随时一键撤销 → Agent 立即停止
```

---

## 1. 已部署的合约地址（来自 demo，已验证能用）

> **重要**：这些合约已经部署在 Monad Testnet 上，能获取真实报价，不需要重新部署。

```
Chain:              Monad Testnet (Chain ID: 10143)
RPC:                https://testnet-rpc.monad.xyz
Explorer:           https://testnet.monadexplorer.com

WMON:               0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A
USDC:               0x534b2f3A21130d7a60830c2Df862319e593943A3
Uniswap V3 Factory: 0x204faca1764b154221e35c0d20abb3c525710498
SwapRouter:         0xfe31f71c1b106eac32f1a19239c9a9a72ddfb900
QuoterV2:           0x661e93cca42afacb172121ef892830ca3b70f08d
PositionManager:    0x7197e214c0b767cfb76fb734ab638e2c192f4e53

x402 Facilitator:   https://x402-facilitator.molandak.org
```

---

## 2. 项目结构（单项目 Next.js 全栈）

把现有 monorepo 的代码合并到一个 Next.js 项目里：

```
clawswap/
├── src/
│   ├── app/
│   │   ├── layout.tsx                 ✅ 搬自 packages/frontend
│   │   ├── page.tsx                   ✅ 搬自 packages/frontend
│   │   ├── providers.tsx              ✅ 搬自 packages/frontend
│   │   ├── globals.css                ✅ 搬自 packages/frontend
│   │   │
│   │   ├── components/
│   │   │   ├── Onboarding.tsx         ✅ 搬自 packages/frontend
│   │   │   ├── MainLayout.tsx         ✅ 搬自 packages/frontend
│   │   │   ├── TestnetBanner.tsx      ✅ 搬自 packages/frontend
│   │   │   └── tabs/
│   │   │       ├── SwapTab.tsx        🔧 搬自 frontend，需接真实 swap 执行
│   │   │       ├── AgentTab.tsx       🔧 搬自 frontend，需接真实 Agent API
│   │   │       └── EarnTab.tsx        🔧 搬自 frontend，需接真实 DB 数据
│   │   │
│   │   └── api/
│   │       └── v1/
│   │           ├── agent/
│   │           │   ├── authorize/route.ts  🔧 搬自 server，需加密存储
│   │           │   ├── revoke/route.ts     🔧 搬自 server，需真实撤销
│   │           │   ├── status/route.ts     🆕 新写
│   │           │   ├── strategy/route.ts   🆕 新写
│   │           │   ├── history/route.ts    🆕 新写
│   │           │   ├── stream/route.ts     🆕 新写 (SSE)
│   │           │   └── instruct/route.ts   🆕 新写
│   │           ├── quote/route.ts          🔧 搬自 server，需接真实 Quoter
│   │           ├── swap/route.ts           🔧 搬自 server，需接真实 Router
│   │           ├── price/route.ts          🔧 搬自 server，需接真实链上价格
│   │           └── health/route.ts         ✅ 搬自 server
│   │
│   ├── lib/
│   │   ├── monad.ts                   ✅ 搬自 demo（最完整，有 ABI + helper）
│   │   ├── smart-wallet.ts            🆕 新写（ZeroDev Kernel 创建）
│   │   ├── session-key.ts             🆕 新写（Session Key 签发）
│   │   ├── x402-server.ts             ✅ 搬自 packages/server
│   │   ├── db.ts                      🆕 新写（Prisma client）
│   │   │
│   │   └── agent/
│   │       ├── agent.ts               🔧 搬自 packages/agent，需补完执行逻辑
│   │       ├── agent-wallet.ts        🔧 搬自 packages/agent，需补 Session Key 反序列化
│   │       ├── intent-parser.ts       ✅ 搬自 packages/agent（中英文解析完整）
│   │       ├── strategy-engine.ts     ✅ 搬自 packages/agent（轮询框架完整）
│   │       ├── strategies/
│   │       │   ├── base.ts            ✅ 搬自 packages/agent
│   │       │   ├── dca.ts             🔧 搬自 packages/agent，evaluate() 是空的
│   │       │   ├── stop-loss.ts       🆕 新写
│   │       │   └── sniper.ts          🆕 新写（框架）
│   │       ├── dex/
│   │       │   ├── types.ts           ✅ 搬自 packages/agent
│   │       │   ├── aggregator.ts      ✅ 搬自 packages/agent
│   │       │   └── clawswap-adapter.ts 🔧 搬自 packages/agent，需用 demo 的 ABI/地址
│   │       └── x402/
│   │           ├── client.ts          ✅ 搬自 packages/agent
│   │           └── budget-manager.ts  ✅ 搬自 packages/agent
│   │
│   └── hooks/
│       ├── useSmartWallet.ts          🆕 新写（AA 钱包 + Session Key hook）
│       ├── useBalances.ts             ✅ 搬自 packages/frontend（真实链上查询）
│       ├── useAgent.ts                🆕 新写（Agent 控制 hook）
│       ├── useAgentStream.ts          🆕 新写（SSE 实时日志）
│       ├── useQuote.ts                🔧 用 demo/monad.ts 的 getQuote 重写
│       └── useSwap.ts                 🆕 新写（真实 swap 执行）
│
├── prisma/
│   └── schema.prisma                  🆕 新写
│
├── package.json
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── .env.example
└── .gitignore
```

---

## 3. 现有代码迁移清单

### 3.1 ✅ 直接搬（不改或极少改）

#### 3.1.1 `src/lib/monad.ts` ← demo/src/lib/monad.ts

**这是最关键的文件**，包含正确的合约地址 + 完整 ABI + 能跑的链上查询。

现有代码完整包含：
- `monadTestnet` 链定义
- `CONTRACTS` 对象（6 个已部署合约地址）
- `ERC20_ABI`（balanceOf, decimals, symbol, approve, allowance）
- `QUOTER_V2_ABI`（quoteExactInputSingle — 注意是 V2 版本，参数是 struct）
- `SWAP_ROUTER_ABI`（exactInputSingle）
- `publicClient` 实例
- `getBalances(address)` — 查 MON + USDC 余额
- `getQuote(tokenIn, tokenOut, amountIn, fee)` — 调 QuoterV2 获取真实报价
- `getPrice()` — 获取 MON/USDC 价格

**迁移时唯一要改的**：把 `CONTRACTS` 里的字段名从 `UNISWAP_FACTORY` 改成 `CLAWSWAP_FACTORY`（品牌重命名，可选）。

```typescript
// 原 demo/src/lib/monad.ts — 直接复制，完整可用
// 这个文件的 getQuote() 已经过验证能返回真实的链上报价
```

#### 3.1.2 `src/app/providers.tsx` ← packages/frontend

现有代码完整包含：
- PrivyProvider（Twitter/Email/Google/Wallet 登录）
- WagmiProvider（Monad Testnet transport）
- QueryClientProvider
- RainbowKit

搬过来后无需修改。

#### 3.1.3 `src/app/components/Onboarding.tsx` ← packages/frontend

登录页 UI 完整：标题、示例指令、三种登录方式、测试网提示。直接搬。

#### 3.1.4 `src/app/components/MainLayout.tsx` ← packages/frontend

Tab 布局完整：顶栏 + 3 Tab + 底部余额条 + 响应式。直接搬。

#### 3.1.5 `src/app/components/TestnetBanner.tsx` ← packages/frontend

水龙头引导完整。直接搬。

#### 3.1.6 `src/hooks/useBalances.ts` ← packages/frontend

**真实链上余额查询**，用 wagmi + viem 读取 MON 和 USDC 余额。直接搬。
需要改的：确保 import 路径指向新的 `monad.ts`。

#### 3.1.7 `src/lib/agent/intent-parser.ts` ← packages/agent

完整的中英文意图解析器：
- `balance` / `余额` / `查询余额` → BalanceIntent
- `Buy 100 MON with USDC` → SwapIntent
- `用100USDC买MON` → SwapIntent

直接搬，改 import 路径。

#### 3.1.8 `src/lib/agent/strategy-engine.ts` ← packages/agent

策略轮询框架：注册策略 → 定时 evaluate → 错误隔离。直接搬。

#### 3.1.9 `src/lib/agent/dex/aggregator.ts` + `types.ts` ← packages/agent

DEX 聚合器：多 DEX 并行报价 + 选最优。直接搬。

#### 3.1.10 `src/lib/agent/strategies/base.ts` ← packages/agent

策略基类（abstract evaluate + StrategyContext）。直接搬。

#### 3.1.11 `src/lib/agent/x402/client.ts` + `budget-manager.ts` ← packages/agent

x402 付费 fetch + 预算管理（日上限 + 单笔上限 + 域名白名单）。直接搬。

#### 3.1.12 `src/lib/x402-server.ts` ← packages/server

x402 ResourceServer：HttpFacilitatorClient + ExactEvmScheme + USDC moneyParser。直接搬。

#### 3.1.13 `src/app/api/v1/health/route.ts` ← packages/server

健康检查端点。直接搬。

---

### 3.2 🔧 需补完（有代码但逻辑不完整）

#### 3.2.1 `src/app/components/tabs/SwapTab.tsx` ← packages/frontend

**现有**：UI 完整（输入/输出/代币选择/报价展示/按钮状态）
**缺失**：
- `handleSwap()` 是空函数，需要接真实的 AA 钱包发交易
- `balanceIn`/`balanceOut` 写死为 0，需要用 `useBalances` 数据
- 报价来源需要从 mock 换成调用 `monad.ts` 的 `getQuote()`

**补完方案**：
```typescript
// handleSwap 需要实现:
// 1. 用 AgentWallet 或 kernelClient 发 approve + swap 两笔交易
// 2. 或用 sendBatchTransaction 合并成一笔 UserOp
// 3. 交易完成后刷新余额

// 报价改为用 demo 的 getQuote():
import { getQuote, CONTRACTS } from "@/lib/monad";
const quote = await getQuote(CONTRACTS.USDC, CONTRACTS.WMON, amountInWei);
```

#### 3.2.2 `src/app/components/tabs/AgentTab.tsx` ← packages/frontend

**现有**：全部 UI 完整（4 种策略选择 + DCA 配置 + 运行 Dashboard + 自然语言对话 + 活动日志 + PnL）
**缺失**：
- Agent 执行全是前端 mock（setTimeout 模拟），需要接 Server API
- Session Key 签发流程需要接 `useSmartWallet().authorizeAgent()`
- 交易日志需要从 SSE 实时接收
- 暂停/停止需要调真实 API

**补完方案**：
```typescript
// 1. 启动 Agent 时:
//    - 调 authorizeAgent() 签发 Session Key
//    - POST /api/v1/agent/strategy 配置策略
//    - 连接 SSE /api/v1/agent/stream

// 2. 运行中:
//    - SSE 推送事件渲染到日志列表
//    - 定时 GET /api/v1/agent/status 更新统计

// 3. 停止时:
//    - POST /api/v1/agent/revoke
```

#### 3.2.3 `src/app/components/tabs/EarnTab.tsx` ← packages/frontend

**现有**：UI 完整（API 端点卡片 + 收益汇总 + SDK 代码示例）
**缺失**：数据全是写死的，需要从 DB 读取 ApiCallLog 聚合数据

**补完方案**：
```typescript
// 改为调用 API 获取真实统计:
const { data } = useSWR("/api/v1/earn/stats");
// 后端从 ApiCallLog 表聚合: today/monthly/total 调用次数和收入
```

#### 3.2.4 `src/lib/agent/agent-wallet.ts` ← packages/agent

**现有**：框架有了（sendTransaction, sendBatchTransaction, getBalance）
**缺失**：
- `initFromSessionKey()` 里的 Session Key 反序列化是 TODO
- Bundler URL 写死了，需要从 env 读取

**补完方案**：
```typescript
// 需要实现:
import { deserializePermissionAccount } from "@zerodev/permissions";

async initFromSessionKey(serializedSessionKey: string) {
  const sessionKeyAccount = await deserializePermissionAccount(
    publicClient,
    ENTRYPOINT_ADDRESS_V07,
    serializedSessionKey
  );
  this.smartAccountAddress = sessionKeyAccount.address;
  this.kernelClient = createKernelAccountClient({
    account: sessionKeyAccount,
    chain: monadTestnet,
    entryPoint: ENTRYPOINT_ADDRESS_V07,
    bundlerTransport: http(process.env.ZERODEV_BUNDLER_URL!),
  });
}
```

#### 3.2.5 `src/lib/agent/strategies/dca.ts` ← packages/agent

**现有**：类定义有了，但 `evaluate()` 是空的
**缺失**：定时触发逻辑 + 调用 getQuote

**补完方案**（参考 demo 的 Agent 模拟逻辑）：
```typescript
// 从 demo/page.tsx 的 agent simulation 里可以参考:
// - 每隔 intervalMs 触发一次
// - 调用 getQuote(CONTRACTS.USDC, CONTRACTS.WMON, amountInWei)
// - 价格波动超过阈值时跳过
// - 返回 TradeSignal { action: "swap", tokenIn, tokenOut, amount, reason }
```

#### 3.2.6 `src/lib/agent/dex/clawswap-adapter.ts` ← packages/agent

**现有**：getQuote() 和 buildSwapTx() 都有了
**缺失**：
- 合约地址需要从旧的改成 demo 的正确地址
- ABI 需要用 demo 的 QuoterV2 ABI（参数是 struct 格式，不是展开参数）
- price impact 计算缺失

**补完方案**：
```typescript
// 关键：demo 的 QuoterV2 ABI 用的是 struct 参数：
// quoteExactInputSingle((address,address,uint256,uint24,uint160))
// 而不是展开的 5 个参数
// 必须用 demo/monad.ts 里的 QUOTER_V2_ABI
// 或者直接调 monad.ts 的 getQuote() helper 函数
```

#### 3.2.7 `src/app/api/v1/agent/authorize/route.ts` ← packages/server

**现有**：接收 POST，但只是 console.log
**缺失**：加密存储 Session Key 到数据库

#### 3.2.8 `src/app/api/v1/agent/revoke/route.ts` ← packages/server

**现有**：接收 POST，但只是 console.log
**缺失**：从数据库标记 Session 为 revoked + 停止 Agent 实例

#### 3.2.9 `src/app/api/v1/quote/route.ts` ← packages/server

**现有**：x402 付费验证完整可用
**缺失**：报价逻辑是 mock（`amountOut = amountIn * 0.997`），需要调用 `monad.ts` 的 `getQuote()`

#### 3.2.10 `src/app/api/v1/swap/route.ts` ← packages/server

**现有**：x402 付费验证完整可用
**缺失**：tx 构建是 mock（`data: "0x12345678..."`），需要用 `SWAP_ROUTER_ABI` 构建真实 calldata

#### 3.2.11 `src/lib/agent/agent.ts` ← packages/agent

**现有**：框架有了（start/stop/handleUserInstruction）
**缺失**：
- `handleUserInstruction()` 里 sendTransaction 被注释掉了
- 缺少风控检查（单笔/日上限/滑点）
- 缺少事件系统（emit events → SSE）
- 缺少交易记录持久化

---

### 3.3 🆕 需要新写

| 文件 | 说明 |
|------|------|
| `src/lib/smart-wallet.ts` | Privy EOA → ZeroDev Kernel AA 钱包创建 |
| `src/lib/session-key.ts` | Session Key 签发（callPolicy + rateLimitPolicy + serialize） |
| `src/hooks/useSmartWallet.ts` | AA 钱包 hook（initWallet + authorizeAgent + revokeAgent） |
| `src/hooks/useAgent.ts` | Agent 控制 hook（start/stop/pause + 轮询 status） |
| `src/hooks/useAgentStream.ts` | SSE 连接 + 实时事件接收 |
| `src/hooks/useSwap.ts` | 真实 swap 执行（approve + swap via AA 钱包） |
| `src/hooks/useQuote.ts` | 包装 monad.ts 的 getQuote，加 debounce |
| `src/app/api/v1/agent/status/route.ts` | 返回 Agent 运行状态 |
| `src/app/api/v1/agent/strategy/route.ts` | 配置/更新策略 |
| `src/app/api/v1/agent/history/route.ts` | 交易历史（从 DB 读） |
| `src/app/api/v1/agent/stream/route.ts` | SSE 端点（实时推送 Agent 事件） |
| `src/app/api/v1/agent/instruct/route.ts` | 自然语言指令 → intent-parser → 执行 |
| `src/lib/agent/strategies/stop-loss.ts` | 止盈止损策略 |
| `src/lib/agent/strategies/sniper.ts` | 新币狙击（框架 + TODO） |
| `src/lib/db.ts` | Prisma client 单例 |
| `prisma/schema.prisma` | User + AgentSession + Trade + ApiCallLog |

---

## 4. 新写代码的完整规范

### 4.1 `src/lib/smart-wallet.ts` 🆕

```typescript
import { createPublicClient, http } from "viem";
import { createKernelAccount, createKernelAccountClient } from "@zerodev/sdk";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { ENTRYPOINT_ADDRESS_V07 } from "permissionless";
import { monadTestnet } from "./monad";

export async function createSmartWallet(privyEoaProvider: any) {
  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(),
  });

  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer: privyEoaProvider,
    entryPoint: ENTRYPOINT_ADDRESS_V07,
  });

  const account = await createKernelAccount(publicClient, {
    plugins: { sudo: ecdsaValidator },
    entryPoint: ENTRYPOINT_ADDRESS_V07,
  });

  const kernelClient = createKernelAccountClient({
    account,
    chain: monadTestnet,
    entryPoint: ENTRYPOINT_ADDRESS_V07,
    bundlerTransport: http(process.env.NEXT_PUBLIC_ZERODEV_BUNDLER_URL!),
    middleware: {
      sponsorUserOperation: async ({ userOperation }) => {
        // ZeroDev Paymaster 代付 gas，用户无需 MON
        return userOperation;
      },
    },
  });

  return { smartAccountAddress: account.address, kernelClient, account, publicClient };
}
```

### 4.2 `src/lib/session-key.ts` 🆕

```typescript
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createKernelAccount } from "@zerodev/sdk";
import { toPermissionValidator } from "@zerodev/permissions";
import { toCallPolicy, toRateLimitPolicy } from "@zerodev/permissions/policies";
import { toECDSASigner } from "@zerodev/permissions/signers";
import { serializePermissionAccount } from "@zerodev/permissions";
import { ENTRYPOINT_ADDRESS_V07 } from "permissionless";
import { CONTRACTS } from "./monad";

export interface SessionKeyConfig {
  maxPerTransaction: bigint;
  maxPerDay: bigint;
  validForHours: number;
  maxCallsPerHour: number;
}

export const DEFAULT_SESSION_CONFIG: SessionKeyConfig = {
  maxPerTransaction: 100_000_000n,  // 100 USDC
  maxPerDay: 1_000_000_000n,        // 1,000 USDC
  validForHours: 24,
  maxCallsPerHour: 10,
};

export async function createAgentSessionKey(
  publicClient: any,
  ownerAccount: any,
  config: SessionKeyConfig = DEFAULT_SESSION_CONFIG
) {
  const agentPrivateKey = generatePrivateKey();
  const agentSigner = toECDSASigner({
    signer: privateKeyToAccount(agentPrivateKey),
  });

  const callPolicy = toCallPolicy({
    permissions: [
      {
        target: CONTRACTS.SWAP_ROUTER,
        functionName: "exactInputSingle",
      },
      {
        target: CONTRACTS.USDC,
        functionName: "approve",
        args: [{ condition: "EQUAL", value: CONTRACTS.SWAP_ROUTER }, null],
      },
    ],
  });

  const rateLimitPolicy = toRateLimitPolicy({
    interval: 3600,
    count: config.maxCallsPerHour,
  });

  const permissionValidator = await toPermissionValidator(publicClient, {
    entryPoint: ENTRYPOINT_ADDRESS_V07,
    signer: agentSigner,
    policies: [callPolicy, rateLimitPolicy],
    validUntil: Math.floor(Date.now() / 1000) + config.validForHours * 3600,
  });

  const sessionKeyAccount = await createKernelAccount(publicClient, {
    plugins: {
      sudo: ownerAccount.plugins.sudo,
      regular: permissionValidator,
    },
    entryPoint: ENTRYPOINT_ADDRESS_V07,
  });

  const serialized = await serializePermissionAccount(sessionKeyAccount, agentPrivateKey);

  return {
    serializedSessionKey: serialized,
    agentAddress: privateKeyToAccount(agentPrivateKey).address,
  };
}
```

### 4.3 `src/hooks/useQuote.ts` 🆕（封装 demo 的 getQuote）

```typescript
import { useState, useEffect } from "react";
import { getQuote, CONTRACTS } from "@/lib/monad";
import { parseUnits, formatUnits, formatEther } from "viem";

export function useQuote(
  amountIn: string,
  direction: "usdc_to_mon" | "mon_to_usdc"
) {
  const [quoteOut, setQuoteOut] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!amountIn || parseFloat(amountIn) <= 0) {
      setQuoteOut(null);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const tokenIn = direction === "usdc_to_mon" ? CONTRACTS.USDC : CONTRACTS.WMON;
        const tokenOut = direction === "usdc_to_mon" ? CONTRACTS.WMON : CONTRACTS.USDC;
        const decimalsIn = direction === "usdc_to_mon" ? 6 : 18;
        const decimalsOut = direction === "usdc_to_mon" ? 18 : 6;
        const amtIn = parseUnits(amountIn, decimalsIn);
        const q = await getQuote(tokenIn, tokenOut, amtIn);
        setQuoteOut(q ? formatUnits(q.amountOut, decimalsOut) : null);
      } catch {
        setQuoteOut(null);
      }
      setLoading(false);
    }, 500); // debounce 500ms

    return () => clearTimeout(timer);
  }, [amountIn, direction]);

  return { quoteOut, loading };
}
```

### 4.4 DCA 策略补完 🔧（基于 demo 的 Agent 模拟逻辑）

```typescript
// src/lib/agent/strategies/dca.ts
// 现有是空壳，用 demo/page.tsx 第 124-197 行的逻辑填充

import { BaseStrategy, type TradeSignal } from "./base";
import { getQuote, CONTRACTS } from "@/lib/monad";
import { parseUnits, formatEther } from "viem";

export interface DCAConfig {
  amountPerInterval: number; // USDC per trade
  intervalMs: number;
  tokenOutSymbol: string;
}

export class DCAStrategy extends BaseStrategy {
  private lastExecution = 0;
  private executionCount = 0;
  private totalSpent = 0;

  constructor(private dcaConfig: DCAConfig) {
    super("DCA");
  }

  async evaluate(): Promise<TradeSignal | null> {
    const now = Date.now();
    if (now - this.lastExecution < this.dcaConfig.intervalMs) {
      return null;
    }

    // 获取真实链上报价（复用 demo 的 getQuote）
    const amtIn = parseUnits(String(this.dcaConfig.amountPerInterval), 6);
    const quote = await getQuote(CONTRACTS.USDC, CONTRACTS.WMON, amtIn);

    if (!quote) {
      return null; // 无流动性，跳过
    }

    this.lastExecution = now;
    this.executionCount++;
    this.totalSpent += this.dcaConfig.amountPerInterval;

    const monAmount = parseFloat(formatEther(quote.amountOut));

    return {
      action: "swap",
      tokenIn: CONTRACTS.USDC,
      tokenOut: CONTRACTS.WMON,
      amount: this.dcaConfig.amountPerInterval,
      reason: `DCA #${this.executionCount}: ${this.dcaConfig.amountPerInterval} USDC → ${monAmount.toFixed(4)} ${this.dcaConfig.tokenOutSymbol}`,
    };
  }

  getStatus() {
    return {
      strategy: "DCA",
      executionCount: this.executionCount,
      totalSpent: this.totalSpent,
      nextExecution: this.lastExecution + this.dcaConfig.intervalMs,
    };
  }
}
```

### 4.5 止盈止损策略 🆕

```typescript
// src/lib/agent/strategies/stop-loss.ts

import { BaseStrategy, type TradeSignal } from "./base";
import { getPrice, CONTRACTS } from "@/lib/monad";

export interface StopLossConfig {
  takeProfitPrice: number;  // MON 涨到这个价卖
  stopLossPrice: number;    // MON 跌到这个价卖
  amountToSell: number;     // 卖多少 USDC 等值
}

export class StopLossStrategy extends BaseStrategy {
  private triggered = false;

  constructor(private config: StopLossConfig) {
    super("StopLoss");
  }

  async evaluate(): Promise<TradeSignal | null> {
    if (this.triggered) return null;

    const priceStr = await getPrice(); // 复用 demo 的 getPrice()
    if (!priceStr) return null;

    const monPerUsdc = parseFloat(priceStr);
    const pricePerMon = monPerUsdc > 0 ? 1 / monPerUsdc : 0;

    if (pricePerMon >= this.config.takeProfitPrice) {
      this.triggered = true;
      return {
        action: "swap",
        tokenIn: CONTRACTS.WMON,
        tokenOut: CONTRACTS.USDC,
        amount: this.config.amountToSell,
        reason: `止盈: MON $${pricePerMon.toFixed(4)} ≥ 目标 $${this.config.takeProfitPrice}`,
      };
    }

    if (pricePerMon <= this.config.stopLossPrice) {
      this.triggered = true;
      return {
        action: "swap",
        tokenIn: CONTRACTS.WMON,
        tokenOut: CONTRACTS.USDC,
        amount: this.config.amountToSell,
        reason: `止损: MON $${pricePerMon.toFixed(4)} ≤ 止损线 $${this.config.stopLossPrice}`,
      };
    }

    return null;
  }

  getStatus() {
    return {
      strategy: "StopLoss",
      takeProfitPrice: this.config.takeProfitPrice,
      stopLossPrice: this.config.stopLossPrice,
      triggered: this.triggered,
    };
  }
}
```

### 4.6 SSE 端点 🆕

```typescript
// src/app/api/v1/agent/stream/route.ts

export const runtime = "nodejs";

export async function GET(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // 注册到全局 Agent 事件系统
      const listener = (event: any) => {
        const data = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(data));
      };

      // TODO: 从 AgentManager 获取当前用户的 Agent 实例
      // agent.on(listener);

      // 心跳
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": heartbeat\n\n"));
      }, 30000);

      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        // agent.off(listener);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

### 4.7 数据库 Schema 🆕

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
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
  serializedSessionKey String
  agentAddress         String?
  status               String    @default("active") // active | paused | revoked
  strategyType         String?   // DCA | StopLoss | Sniper
  strategyConfig       String?   // JSON
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
  status    String   // success | failed | skipped
  reason    String?
  createdAt DateTime @default(now())
}

model ApiCallLog {
  id        String   @id @default(cuid())
  endpoint  String
  paidAmount String?
  createdAt DateTime @default(now())
}
```

---

## 5. 环境变量

```env
# .env.example

# === Monad Testnet ===
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
NEXT_PUBLIC_MONAD_RPC_URL=https://testnet-rpc.monad.xyz

# === 已部署合约（不用改，直接用）===
# 在 src/lib/monad.ts 的 CONTRACTS 对象里硬编码，不需要 env

# === Privy ===
NEXT_PUBLIC_PRIVY_APP_ID=你的privy-app-id

# === ZeroDev ===
NEXT_PUBLIC_ZERODEV_BUNDLER_URL=https://rpc.zerodev.app/api/v2/bundler/你的project-id
NEXT_PUBLIC_ZERODEV_PAYMASTER_URL=https://rpc.zerodev.app/api/v2/paymaster/你的project-id
ZERODEV_BUNDLER_URL=https://rpc.zerodev.app/api/v2/bundler/你的project-id

# === x402 ===
PAY_TO_ADDRESS=0x你的收款地址
X402_FACILITATOR_URL=https://x402-facilitator.molandak.org

# === 数据库 ===
DATABASE_URL=file:./dev.db

# === Session Key 加密 ===
SESSION_KEY_ENCRYPTION_SECRET=64位hex字符串

# === 可选：LLM 意图解析 ===
ANTHROPIC_API_KEY=sk-ant-...
```

---

## 6. 开发顺序（给 Cursor）

### Phase 1: 搬代码 + 跑起来 (Day 1)

```
Step 1: 创建项目 + 安装依赖
Step 2: 搬 ✅ 直接搬 的 13 个文件
Step 3: 修复 import 路径
Step 4: pnpm dev 跑通（能看到 Onboarding 登录页）
Step 5: 验证 Privy 登录能用
Step 6: 验证 useBalances 能查到链上余额
Step 7: 验证 getQuote 能获取真实报价（在 SwapTab 里试）
```

### Phase 2: AA 钱包 + Session Key (Day 2)

```
Step 8: 实现 smart-wallet.ts（🆕 新写）
Step 9: 实现 session-key.ts（🆕 新写）
Step 10: 实现 useSmartWallet hook（🆕 新写）
Step 11: 验证：登录后能创建 AA 钱包地址
Step 12: 验证：能签发 Session Key
```

### Phase 3: 补完 Agent 核心 (Day 3-4)

```
Step 13: 补完 agent-wallet.ts（🔧 Session Key 反序列化）
Step 14: 补完 dca.ts（🔧 用 demo 的 getQuote 逻辑）
Step 15: 新写 stop-loss.ts（🆕）
Step 16: 补完 agent.ts（🔧 风控 + 事件 + 真实执行）
Step 17: 补完 clawswap-adapter.ts（🔧 用 demo 的 ABI/地址）
```

### Phase 4: 补完 API (Day 4-5)

```
Step 18: 数据库（🆕 prisma schema + db.ts）
Step 19: 补完 authorize/revoke（🔧 加密存储 + 真实撤销）
Step 20: 新写 status/strategy/history/instruct（🆕）
Step 21: 新写 stream SSE 端点（🆕）
Step 22: 补完 quote/swap 端点（🔧 用真实 getQuote + buildSwapTx）
```

### Phase 5: 补完前端 (Day 5-6)

```
Step 23: 补完 SwapTab（🔧 接 useQuote + useSwap）
Step 24: 补完 AgentTab（🔧 接 useAgent + useAgentStream + 真实 API）
Step 25: 补完 EarnTab（🔧 接 DB 数据）
Step 26: 新写 useSwap/useAgent/useAgentStream hooks
```

### Phase 6: 打磨 (Day 7)

```
Step 27: 端到端测试
Step 28: 动画/响应式/格式化
Step 29: 错误处理 + Loading 状态
```

---

## 7. 从 Demo 可以直接复用的交易逻辑

Demo 的 `page.tsx` 第 124-197 行有一段**完整的 DCA Agent 模拟逻辑**，虽然是前端模拟（不发真实交易），但核心流程可以直接搬到服务端 Agent：

```
1. 每隔 N 秒执行一次（✅ 已有 strategy-engine 的 interval 机制）
2. 调用 getQuote(USDC, WMON, amount)（✅ demo 有现成的）
3. 检查价格波动 > 5% 就跳过（demo 用 random 模拟，改成真实比较）
4. 记录 totalBought + totalSpent（✅ demo 有 PnL 计算）
5. 推送日志（time, action, detail, status）
```

**区别是**：demo 只是前端记个数，真实 Agent 需要调用 `agentWallet.sendTransaction()` 来真正执行 swap。

---

## 8. 不需要做的事

| 不需要 | 理由 |
|--------|------|
| 重新部署合约 | 已有部署好的 Uniswap V3 在 Monad Testnet |
| 写合约测试 | 合约已部署且能用 |
| 搭 monorepo | 单 Next.js 项目更快 |
| 自建 x402 facilitator | 用 Monad 官方的 |
| 做 SDK npm 包 | 黑客松不需要，后续再做 |
| 移动端 App | 先做 Web |
