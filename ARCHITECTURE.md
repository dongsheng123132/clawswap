# 系统架构设计

## 1. 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          OpenClaw Platform                              │
│                                                                         │
│  ┌───────────────────── 用户层 ─────────────────────────────────┐      │
│  │                                                               │      │
│  │  用户 Twitter/Email/Google 登录                               │      │
│  │         │                                                     │      │
│  │         ▼                                                     │      │
│  │  ┌─────────────┐     ┌──────────────────────┐               │      │
│  │  │   Privy     │────▶│  ZeroDev Kernel      │               │      │
│  │  │ (社交登录)   │     │  (AA 智能合约钱包)    │               │      │
│  │  │ 生成 EOA    │     │  ERC-4337 / EIP-7702 │               │      │
│  │  │ Signer     │     └──────────┬───────────┘               │      │
│  │  └─────────────┘                │                            │      │
│  │                                 │ 签发 Session Key           │      │
│  │                                 ▼                            │      │
│  │                    ┌────────────────────────┐               │      │
│  │                    │  Session Key (受限)     │               │      │
│  │                    │  • 只能调白名单合约      │               │      │
│  │                    │  • 单笔上限 100 USDC    │               │      │
│  │                    │  • 日上限 1000 USDC     │               │      │
│  │                    │  • 有效期 24h 可续       │               │      │
│  │                    └────────────┬───────────┘               │      │
│  └─────────────────────────────────│───────────────────────────┘      │
│                                    │                                    │
│  ┌─────────────────────────────────▼───────────────────────────┐      │
│  │                     Agent Core (TS/Node)                     │      │
│  │  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐     │      │
│  │  │ 意图解析  │  │  策略引擎     │  │  x402 Client      │     │      │
│  │  │ (NLP)    │  │ DCA/Grid/SL  │  │ (自动付费买数据)   │     │      │
│  │  └──────────┘  └──────────────┘  └───────────────────┘     │      │
│  │                        │                                     │      │
│  │              ┌─────────▼──────────┐                         │      │
│  │              │  DEX Aggregator    │                         │      │
│  │              │  (路由 + 报价引擎)  │                         │      │
│  │              └─────────┬──────────┘                         │      │
│  └────────────────────────│────────────────────────────────────┘      │
│                           │                                            │
│  ┌────────────────────────▼────────────────────────────────────┐      │
│  │                   Blockchain Layer                           │      │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐   │      │
│  │  │ OpenClaw AMM │  │  Kuru DEX    │  │ PancakeSwap V4 │   │      │
│  │  └──────────────┘  └──────────────┘  └────────────────┘   │      │
│  │                                                             │      │
│  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐   │      │
│  │  │ ERC-4337     │  │ Paymaster    │  │ Bundler        │   │      │
│  │  │ EntryPoint   │  │ (代付 gas)   │  │ (Pimlico)      │   │      │
│  │  └──────────────┘  └──────────────┘  └────────────────┘   │      │
│  │                                                             │      │
│  │                  Monad Network (eip155:10143)               │      │
│  └─────────────────────────────────────────────────────────────┘      │
│                                                                         │
│  外部服务：                                                             │
│  ┌──────────────────┐  ┌──────────────┐  ┌─────────────────┐          │
│  │ x402 Facilitator │  │  Privy MPC   │  │ ZeroDev Bundler │          │
│  │ (Monad 官方)     │  │  (密钥托管)   │  │ + Paymaster     │          │
│  └──────────────────┘  └──────────────┘  └─────────────────┘          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.1 为什么不用裸私钥？

**旧方案（已废弃）：Agent 直接管理 EOA 私钥**
- 私钥丢失 = 资金永久丢失，无法找回
- 私钥存在服务器 = 巨大安全风险（被黑 = 全部资金被盗）
- 无恢复机制
- Agent 有完全控制权，用户无法限制

**新方案：社交登录 + AA 钱包 + Session Key**
- 用户用 Twitter/Email 登录 → Privy 托管密钥分片（MPC）→ 无私钥暴露
- 生成 ERC-4337 智能合约钱包 → 支持社交恢复、多签
- Agent 只拿到 Session Key → 权限受限（白名单合约、金额上限、时间限制）
- 用户随时可以撤销 Agent 的 Session Key
- Paymaster 代付 gas → 用户不需要持有 MON

## 2. 模块详细设计

### 2.1 项目目录结构

```
openclaw/
├── packages/
│   ├── contracts/                 # Solidity 合约（Foundry 项目）
│   │   ├── src/
│   │   │   ├── core/
│   │   │   │   ├── OpenClawFactory.sol
│   │   │   │   ├── OpenClawPool.sol
│   │   │   │   └── libraries/
│   │   │   ├── periphery/
│   │   │   │   ├── SwapRouter.sol
│   │   │   │   ├── NonfungiblePositionManager.sol
│   │   │   │   └── Quoter.sol
│   │   │   └── interfaces/
│   │   ├── script/                # 部署脚本
│   │   ├── test/                  # 合约测试
│   │   └── foundry.toml
│   │
│   ├── agent/                     # AI Agent 核心
│   │   ├── src/
│   │   │   ├── core/
│   │   │   │   ├── agent.ts              # Agent 主循环
│   │   │   │   ├── intent-parser.ts      # 自然语言意图解析
│   │   │   │   └── strategy-engine.ts    # 策略引擎
│   │   │   ├── wallet/
│   │   │   │   ├── wallet-manager.ts     # 钱包创建/管理
│   │   │   │   ├── key-store.ts          # 加密密钥存储
│   │   │   │   └── balance-tracker.ts    # 余额追踪
│   │   │   ├── dex/
│   │   │   │   ├── aggregator.ts         # DEX 聚合器
│   │   │   │   ├── router.ts             # 最优路径路由
│   │   │   │   ├── openclaw-pool.ts      # 自建 AMM 接口
│   │   │   │   ├── kuru-adapter.ts       # Kuru DEX 适配器
│   │   │   │   └── pancake-adapter.ts    # PancakeSwap 适配器
│   │   │   ├── strategies/
│   │   │   │   ├── dca.ts                # 定投策略
│   │   │   │   ├── grid.ts              # 网格交易
│   │   │   │   ├── stop-loss.ts         # 止盈止损
│   │   │   │   └── base-strategy.ts     # 策略基类
│   │   │   ├── x402/
│   │   │   │   ├── client.ts            # x402 付费客户端
│   │   │   │   └── budget-manager.ts    # 预算管理
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── server/                    # API 服务 + x402 付费墙
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── api/
│   │   │   │   │   ├── v1/
│   │   │   │   │   │   ├── quote/route.ts      # 报价 API（x402 付费）
│   │   │   │   │   │   ├── swap/route.ts       # 执行交易 API（x402 付费）
│   │   │   │   │   │   ├── price/route.ts      # 实时价格 API（x402 付费）
│   │   │   │   │   │   ├── wallet/route.ts     # 钱包管理 API（免费）
│   │   │   │   │   │   └── health/route.ts     # 健康检查
│   │   │   │   │   └── x402/
│   │   │   │   │       └── config.ts           # x402 服务端配置
│   │   │   │   ├── layout.tsx
│   │   │   │   └── page.tsx
│   │   │   ├── lib/
│   │   │   │   ├── x402-server.ts              # x402 服务端封装
│   │   │   │   └── monad.ts                    # Monad 链配置
│   │   │   └── middleware.ts
│   │   ├── package.json
│   │   └── next.config.ts
│   │
│   ├── frontend/                  # DEX 前端
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── swap/page.tsx
│   │   │   │   ├── pool/page.tsx
│   │   │   │   ├── agent/page.tsx         # Agent 控制面板
│   │   │   │   └── layout.tsx
│   │   │   ├── components/
│   │   │   │   ├── SwapCard.tsx
│   │   │   │   ├── TokenSelector.tsx
│   │   │   │   ├── LiquidityPanel.tsx
│   │   │   │   └── AgentDashboard.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── useSwap.ts
│   │   │   │   ├── useQuote.ts
│   │   │   │   └── useAgent.ts
│   │   │   └── lib/
│   │   │       ├── contracts.ts           # 合约 ABI + 地址
│   │   │       └── wagmi-config.ts        # wagmi 配置
│   │   └── package.json
│   │
│   └── sdk/                       # 对外发布的 SDK
│       ├── src/
│       │   ├── client.ts                  # OpenClaw SDK 入口
│       │   ├── swap.ts                    # swap 功能
│       │   ├── quote.ts                   # 报价功能
│       │   └── types.ts                   # 类型定义
│       └── package.json
│
├── turbo.json                     # Turborepo 配置
├── package.json                   # 根 package.json (workspace)
├── .env.example
└── README.md
```

### 2.2 钱包架构：Privy + ZeroDev AA 钱包 + Session Key

#### 2.2.1 钱包创建流程

```
用户打开 OpenClaw 网站
    │
    ▼
用户选择登录方式（Twitter / Email / Google）
    │
    ▼
Privy SDK 处理认证
    │  • OAuth 回调（Twitter/Google）
    │  • Magic Link（Email）
    │  • Passkey
    ▼
Privy 创建 Embedded Wallet (EOA)
    │  • 用 MPC 分片密钥，私钥从未完整出现在任何一方
    │  • SOC 2 合规，TEE + 分布式密钥分片
    │  • 用户无需保管助记词
    ▼
以 Privy EOA 为 Signer，创建 ZeroDev Kernel Smart Account
    │  • ERC-4337 智能合约钱包
    │  • 地址确定性派生（同一用户始终相同地址）
    │  • 懒部署（首次交易时才上链，省 gas）
    ▼
AA 钱包创建完成
    │  • 地址：0xABC...（智能合约地址）
    │  • Owner：Privy Embedded EOA
    │  • 可以接收 MON、USDC、任意 ERC-20
    ▼
用户存入 USDC → 准备交易
```

#### 2.2.2 Session Key 授权给 Agent

```
用户在 Dashboard 点击 "启用 AI Agent"
    │
    ▼
前端生成一对临时密钥对（Agent Session Key）
    │  agentSessionKey = generatePrivateKey()
    │  agentPublicKey = privateKeyToAddress(agentSessionKey)
    ▼
用户签署 Session Key 授权（通过 Privy 弹窗确认）
    │  包含权限策略 Policy：
    │  ┌─────────────────────────────────────────┐
    │  │ ✅ 允许调用的合约:                        │
    │  │    • OpenClaw Router (swap)              │
    │  │    • USDC 合约 (approve)                 │
    │  │    • Kuru Router (swap)                  │
    │  │ ❌ 禁止: 任意 transfer、其他合约调用       │
    │  │                                          │
    │  │ 💰 金额限制:                              │
    │  │    • 单笔最大: 100 USDC                  │
    │  │    • 每日累计: 1,000 USDC                │
    │  │                                          │
    │  │ ⏰ 时间限制:                              │
    │  │    • 有效期: 24 小时                      │
    │  │    • 可提前撤销                           │
    │  │                                          │
    │  │ 🔄 频率限制:                              │
    │  │    • 每小时最多 10 笔交易                  │
    │  └─────────────────────────────────────────┘
    ▼
Session Key 签名存储到后端
    │  Agent 服务器安全存储 agentSessionKey（加密）
    ▼
Agent 使用 Session Key 发送 UserOperation
    │  • 不需要用户逐笔确认
    │  • 受 Policy 限制，无法超限
    │  • Bundler 打包 → EntryPoint 执行
    │  • Paymaster 代付 gas（可选）
    ▼
用户随时可在 Dashboard 一键撤销 Session Key
```

#### 2.2.3 技术实现接口

```typescript
// packages/agent/src/wallet/smart-wallet.ts

import { createKernelAccount, createKernelAccountClient } from "@zerodev/sdk";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { toPermissionValidator } from "@zerodev/permissions";
import { toCallPolicy, toGasPolicy, toRateLimitPolicy } from "@zerodev/permissions/policies";
import { toECDSASigner } from "@zerodev/permissions/signers";
import { ENTRYPOINT_ADDRESS_V07 } from "permissionless";

// ========== 用户侧：创建 AA 钱包 ==========

interface SmartWalletService {
  // 用 Privy EOA 创建 ZeroDev Kernel 账户
  createSmartWallet(privyEoaSigner: any): Promise<{
    smartAccountAddress: `0x${string}`;
    kernelClient: any;
  }>;

  // 查询 AA 钱包余额
  getBalance(smartAccountAddress: `0x${string}`): Promise<TokenBalance[]>;

  // 签发 Session Key 给 Agent
  createSessionKey(params: {
    kernelClient: any;
    agentPublicKey: `0x${string}`;
    policies: SessionKeyPolicy;
  }): Promise<SerializedSessionKey>;

  // 撤销 Session Key
  revokeSessionKey(sessionKeyAddress: `0x${string}`): Promise<void>;
}

// ========== Agent 侧：使用 Session Key 交易 ==========

interface AgentWalletClient {
  // 从序列化的 Session Key 恢复 Agent 的 kernelClient
  fromSessionKey(serialized: SerializedSessionKey): Promise<any>;

  // 用 Session Key 发送交易（受限）
  sendTransaction(params: {
    to: `0x${string}`;
    data: `0x${string}`;
    value: bigint;
  }): Promise<`0x${string}`>; // tx hash
}

// ========== 权限策略定义 ==========

interface SessionKeyPolicy {
  // 合约调用白名单
  callPolicy: {
    allowedContracts: Array<{
      address: `0x${string}`;
      allowedFunctions: string[];  // function selectors
    }>;
  };
  // 金额限制
  spendingLimit: {
    maxPerTransaction: bigint;  // 单笔上限 (USDC wei)
    maxPerDay: bigint;          // 日上限
  };
  // 时间限制
  validUntil: number;  // Unix timestamp
  // 频率限制
  rateLimit: {
    maxCallsPerHour: number;
  };
}

// ========== 序列化（前端→后端传输）==========

// Session Key 需要序列化后传给 Agent 服务器
// ZeroDev 提供 serializePermissionAccount / deserializePermissionAccount
type SerializedSessionKey = string; // base64 编码的序列化数据
```

#### 2.2.4 关键安全保证

| 风险场景 | 裸私钥方案 | AA + Session Key 方案 |
|---------|-----------|---------------------|
| 服务器被黑 | 全部资金被盗 | Agent 只有 Session Key，受限操作，最多损失日限额 |
| 私钥丢失 | 资金永久丢失 | 用 Twitter/Email 重新登录即可恢复 |
| Agent 失控 | 可以 drain 全部余额 | Policy 限制：白名单合约、金额上限、时间过期 |
| 用户想停止 | 需要转移全部资金 | Dashboard 一键撤销 Session Key |
| 多设备使用 | 需要同步私钥（极危险）| 社交登录，任何设备登录即可 |
| Gas 费 | 用户需要持有 MON | Paymaster 代付，用户只需 USDC |

#### 2.2.5 Monad 上的 AA 基础设施

| 组件 | 提供商 | 说明 |
|------|--------|------|
| 社交登录 + MPC 密钥 | [Privy](https://privy.io) | Monad testnet 免费，支持 Twitter/Email/Google |
| AA 智能合约钱包 | [ZeroDev Kernel](https://zerodev.app) | ERC-4337 + Session Key + Policy |
| Bundler | [Pimlico](https://pimlico.io) / ZeroDev | 打包 UserOperation 上链 |
| Paymaster | Pimlico / ZeroDev / Biconomy | 代付 gas，用户 gasless |
| EntryPoint | ERC-4337 标准 | 已部署在 Monad testnet |

> **备选方案**: 如果 ZeroDev 对 Monad 支持有问题，可以用：
> - Biconomy Smart Account（已确认支持 Monad）
> - thirdweb Account Abstraction
> - Alchemy Account Kit

### 2.3 DEX Aggregator 模块

```typescript
// packages/agent/src/dex/aggregator.ts

interface DEXAggregator {
  // 从所有 DEX 获取报价
  getQuotes(params: QuoteParams): Promise<Quote[]>;

  // 选择最优路径并执行
  executeBestSwap(params: SwapParams): Promise<SwapResult>;

  // 注册新的 DEX 适配器
  registerDEX(adapter: DEXAdapter): void;
}

interface DEXAdapter {
  name: string;                                        // "openclaw" | "kuru" | "pancakeswap"
  getQuote(params: QuoteParams): Promise<Quote>;       // 获取报价
  executeSwap(params: SwapParams): Promise<SwapResult>; // 执行交易
  getSupportedPairs(): Promise<TokenPair[]>;           // 支持的交易对
}

interface QuoteParams {
  tokenIn: string;      // 输入 token 地址
  tokenOut: string;     // 输出 token 地址
  amountIn: bigint;     // 输入数量
  slippage: number;     // 滑点容忍度 (0.005 = 0.5%)
}

// 路由算法：
// 1. 并行查询所有 DEX 的报价
// 2. 计算最优单跳路径
// 3. 检查多跳路径（A→B→C 是否优于 A→C）
// 4. 考虑 gas 成本，选择净收益最高的路径
```

### 2.4 Agent Core 模块

```typescript
// packages/agent/src/core/agent.ts

interface AgentConfig {
  mode: "autonomous" | "assisted";  // 自主 vs 辅助
  wallet: WalletConfig;
  strategies: StrategyConfig[];
  x402: X402ClientConfig;
  limits: {
    maxTradeSize: number;     // 单笔最大金额 (USDC)
    dailyLimit: number;       // 日交易上限
    maxSlippage: number;      // 最大滑点
  };
}

// Agent 主循环（自主模式）
// 1. 加载钱包 & 检查余额
// 2. 运行策略引擎（检查是否满足触发条件）
// 3. 如果触发 → 获取报价 → 验证风控 → 执行交易
// 4. 记录交易 → 更新 PnL → 等待下次检查
// 5. 循环

// Agent 指令模式（辅助模式）
// 1. 接收用户自然语言指令
// 2. intent-parser 解析意图（swap/addLiquidity/checkBalance/...）
// 3. 生成执行计划 → 返回给用户确认
// 4. 用户确认 → 执行 → 返回结果
```

### 2.5 x402 Server 配置

```typescript
// packages/server/src/lib/x402-server.ts

import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";

const MONAD_NETWORK = "eip155:10143";
const MONAD_USDC = "0x534b2f3A21130d7a60830c2Df862319e593943A3";
const FACILITATOR_URL = "https://x402-facilitator.molandak.org";

// 配置 facilitator 客户端
const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const server = new x402ResourceServer(facilitatorClient);

// 注册 Monad 网络的 exact scheme
const monadScheme = new ExactEvmScheme();
monadScheme.registerMoneyParser(async (amount, network) => {
  if (network === MONAD_NETWORK) {
    return {
      amount: Math.floor(amount * 1_000_000).toString(),
      asset: MONAD_USDC,
      extra: { name: "USDC", version: "2" },
    };
  }
  return null;
});
server.register(MONAD_NETWORK, monadScheme);

// API 端点定价
export const PRICING = {
  quote: { price: "$0.0001", description: "Get swap quote" },
  swap:  { price: "$0.001",  description: "Execute swap" },
  price: { price: "$0.0001", description: "Get token price" },
};
```

### 2.6 x402 Client 配置

```typescript
// packages/agent/src/x402/client.ts

import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { x402Client } from "@x402/core/client";

// Agent 作为 x402 消费者，自动为 HTTP 请求付费
export function createX402Fetch(walletSigner: EvmSigner) {
  const scheme = new ExactEvmScheme(walletSigner);
  const client = new x402Client().register("eip155:10143", scheme);
  return wrapFetchWithPayment(fetch, client);
}

// 使用：Agent 调用任何 x402 API 时自动付费
// const x402Fetch = createX402Fetch(agentWallet);
// const data = await x402Fetch("https://some-api.com/data"); // 自动付 USDC
```

---

## 3. 技术选型

| 层级 | 技术 | 理由 |
|------|------|------|
| 智能合约 | Solidity + Foundry | Uniswap V3 fork，Foundry 编译快、测试好 |
| Agent Runtime | TypeScript + Node.js | x402 SDK 官方支持最好，生态最丰富 |
| API 服务 | Next.js 14 (App Router) | @x402/next 原生支持，SSR + API Routes |
| 前端 | Next.js + wagmi + viem + Tailwind + shadcn/ui | Monad EVM 兼容，wagmi 标准钱包连接 |
| LLM 集成 | Claude API (claude-sonnet-4-6) | 意图解析、策略建议 |
| 数据库 | SQLite (本地) / PostgreSQL (生产) | 交易记录、Agent 状态 |
| Monorepo | Turborepo + pnpm workspace | 多包管理 |
| 部署 | Vercel (前端+API) + Railway (Agent) | 简单部署 |

---

## 4. 链上配置

| 参数 | 值 |
|------|------|
| Network | Monad Testnet |
| Chain ID | 10143 |
| CAIP-2 | eip155:10143 |
| RPC | https://testnet-rpc.monad.xyz |
| 区块浏览器 | https://testnet.monadexplorer.com |
| USDC 合约 | 0x534b2f3A21130d7a60830c2Df862319e593943A3 |
| x402 Facilitator | https://x402-facilitator.molandak.org |
| Gas Token | MON |

---

## 5. 安全设计

### 5.1 钱包安全（AA + Session Key 分层）

**第一层：用户主权（Privy + ZeroDev）**
- 用户通过社交账号（Twitter/Email/Google）登录
- Privy MPC 分片密钥：私钥从未完整存在于任何一台机器
- ZeroDev Kernel 智能合约钱包：支持社交恢复
- 用户是唯一的 Owner，完全控制资金

**第二层：Agent 受控权限（Session Key）**
- Agent 只持有 Session Key，不是 Owner
- Session Key 权限策略（Policy）：
  - 合约白名单：只能调用 OpenClaw Router、USDC approve、已知 DEX
  - 金额上限：单笔 ≤ 100 USDC，日累计 ≤ 1,000 USDC（用户可调）
  - 时间限制：默认 24 小时过期，需要续签
  - 频率限制：每小时最多 10 笔交易
  - 禁止：任意 ERC-20 transfer（防止 Agent 把钱转走）
- 用户一键撤销 Session Key → Agent 立即失去交易能力

**第三层：链上强制执行**
- Policy 写在智能合约中，不可绕过
- 即使 Agent 服务器被黑，攻击者也只能在 Policy 范围内操作
- 最坏情况：损失 = 日限额（1,000 USDC），不是全部余额

### 5.2 交易安全
- Session Key Policy 链上强制：白名单合约、金额上限
- 滑点保护（默认 0.5%，不允许超过 5%）
- Agent 侧额外软限制（比链上限制更严格）
- 异常检测：短时间大量交易 → 自动暂停 + 通知用户

### 5.3 x402 安全
- x402 付费使用独立的 Agent 运营钱包（不是用户钱包）
- 付费预算上限（单次 $0.01 / 日 $1.00）
- 白名单域名管理
- 付费金额异常告警

### 5.4 Session Key 存储安全
- Agent 服务端的 Session Key 用 AES-256-GCM 加密存储
- 主密钥通过环境变量注入
- Session Key 过期后自动清理
- 审计日志：记录每次 Session Key 的创建、使用、撤销
