# OpenClaw / ClawSwap — AI Agent 自动交易平台

## 项目概述
Monad Testnet 上的 AI Agent 自动交易平台。用户通过 Privy 社交登录，获得 ZeroDev AA 钱包，授权 AI Agent 通过 Session Key 自动执行 DCA/止损等交易策略。对外通过 x402 协议提供付费 API。

## 技术栈
- **前端**: Next.js 14 + Tailwind + Privy + wagmi + viem
- **后端**: Next.js API Routes (port 3001) + Prisma + SQLite
- **Agent**: TypeScript 独立包 (strategy engine + DEX aggregator)
- **链**: Monad Testnet (chainId: 10143, RPC: https://testnet-rpc.monad.xyz)
- **AA 钱包**: ZeroDev Kernel v3 + Paymaster
- **包管理**: npm workspaces + turborepo

## 项目结构
```
packages/
  frontend/  → Next.js 前端 (port 3000) — Privy 登录、Swap/Agent/Earn Tab
  server/    → Next.js API 后端 (port 3001) — Agent API、x402 付费端点
  agent/     → AI Agent 核心包 — 策略引擎、DEX 聚合、意图解析
  sdk/       → 客户端 SDK
  contracts/ → Uniswap V3 fork (已部署，不再需要修改)
demo/        → 独立 demo (合约地址和 ABI 的参考源)
```

## 正确的合约地址（已验证可用，来自 demo/src/lib/monad.ts）
```
WMON:              0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A
USDC:              0x534b2f3A21130d7a60830c2Df862319e593943A3
UNISWAP_FACTORY:   0x204faca1764b154221e35c0d20abb3c525710498
SWAP_ROUTER:       0xfe31f71c1b106eac32f1a19239c9a9a72ddfb900
QUOTER_V2:         0x661e93cca42afacb172121ef892830ca3b70f08d
POSITION_MANAGER:  0x7197e214c0b767cfb76fb734ab638e2c192f4e53
```

**重要**: `packages/server/src/lib/monad.ts` 和 `packages/agent/src/wallet/chains.ts` 中的合约地址是错误的旧地址，必须更新为上面的地址。

## 正确的 ABI（来自 demo/src/lib/monad.ts）
- QuoterV2 使用 **struct 参数格式**: `quoteExactInputSingle((address,address,uint256,uint24,uint160))` 返回 `(uint256,uint160,uint32,uint256)`
- SwapRouter 使用 **struct 参数格式**: `exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))`
- 不要使用展开参数的旧 ABI

## 当前完成状态
### 已完成 ✅
- Prisma schema (User, AgentSession, Trade, ApiCallLog) + SQLite
- Agent API 全部端点 (authorize/revoke/status/strategy/history/stream/instruct)
- agent-events.ts SSE 事件总线
- useAgent + useAgentStream 前端 hooks
- AgentTab 已接入真实 API
- EarnTab + earn/stats 统计端点
- 前端 UI 完整 (Swap/Agent/Earn tabs, Onboarding, TestnetBanner)
- intent-parser.ts 中英文 NLP 意图解析
- strategy-engine.ts 策略轮询框架
- DEX aggregator + adapter 模式

### Phase 2 已完成 ✅
- 合约地址统一（3 处 chains.ts/monad.ts 全部更新为正确地址）
- 真实链上报价（quote/swap 端点调 QuoterV2 + encodeFunctionData）
- Agent DCA 模拟循环（读真实报价，写 Trade 记录，发 SSE 事件）
- SwapTab 接入 AA 钱包（构建 calldata + sendTransaction）
- useAgentStats hook + 运行面板真实数据

### Phase 3 进行中 🔧（测试网真实交易 — AA 全套）
1. 修复 AA 钱包创建（对齐 ZeroDev SDK: getEntryPoint("0.7") + KERNEL_V3_1）
2. SwapTab 通过 AA 钱包执行真实 swap（gasless, 批量 approve+swap）
3. Agent 用服务端 PRIVATE_KEY 钱包真实执行 DCA swap
4. AgentTab 显示 Agent 钱包地址/余额 + Explorer 链接

### 后续可选
- Session Key 权限收紧（toSudoPolicy → callPolicy+rateLimitPolicy）
- 止盈止损策略
- x402 server 构建修复（@x402/core export 错误）

## ZeroDev 配置
- Dashboard: https://dashboard.zerodev.app/
- ZeroDev 已确认支持 Monad Testnet
- Bundler URL: `https://rpc.zerodev.app/api/v2/bundler/${PROJECT_ID}`
- Paymaster URL: `https://rpc.zerodev.app/api/v2/paymaster/${PROJECT_ID}`
- SDK 最新 API: `getEntryPoint("0.7")`, `KERNEL_V3_1` (不是 entryPoint07Address / "0.3.1")

## 开发规范
- 使用 viem，不使用 ethers.js
- 金额精度: USDC 6 位小数, MON/WMON 18 位小数
- 前端 → 后端 API 调用通过 `getApiUrl()` 拼接 `NEXT_PUBLIC_API_URL`
- Agent 事件通过 `emitAgentEvent()` + SSE 推送到前端
- 数据库操作通过 `prisma` 单例
