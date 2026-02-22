# ClawSwap — Cursor 开发指令集 v2

> 本项目已有约 60-70% 的代码。以下 Prompt 先搬现有代码，再补完缺失逻辑。
> 按顺序执行，每步确认通过再下一步。

---

## 全局上下文（每次对话开头粘贴）

```
你正在开发 ClawSwap — Monad 上的 AI Agent 自动交易平台。
这是一个已有部分代码的项目，我们要把分散的代码合并成一个 Next.js 全栈项目。

核心流程：
用户 Twitter 登录 → 自动建 AA 钱包(ZeroDev) → 选策略 → 签发 Session Key → AI Agent 24/7 自动交易

已部署合约（Uniswap V3 on Monad Testnet，已验证能用）：
- WMON: 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A
- USDC: 0x534b2f3A21130d7a60830c2Df862319e593943A3
- Factory: 0x204faca1764b154221e35c0d20abb3c525710498
- SwapRouter: 0xfe31f71c1b106eac32f1a19239c9a9a72ddfb900
- QuoterV2: 0x661e93cca42afacb172121ef892830ca3b70f08d
- PositionManager: 0x7197e214c0b767cfb76fb734ab638e2c192f4e53

技术栈：Next.js 14 (App Router) + Tailwind + Privy + ZeroDev + viem + x402 + Prisma/SQLite
代码规范：TypeScript 严格模式，viem（不用 ethers），async/await，不用 any。

参考文档：CLAWSWAP-FULL-SPEC.md
```

---

## Prompt 1: 创建项目 + 搬入现有代码

```
我要创建 ClawSwap 项目。项目已有大量可复用的代码，分散在 demo/ 和 packages/ 目录里。

Step 1: 创建 Next.js 项目
在当前目录创建 clawswap/：
npx create-next-app@latest clawswap --typescript --tailwind --eslint --app --src-dir

Step 2: 安装依赖
cd clawswap
pnpm add viem wagmi @tanstack/react-query
pnpm add @privy-io/react-auth @rainbow-me/rainbowkit
pnpm add @radix-ui/react-dialog @radix-ui/react-select @radix-ui/react-tabs
pnpm add framer-motion lucide-react clsx
pnpm add -D prisma

Step 3: 从现有项目搬入以下文件（直接复制，只改 import 路径）

=== 核心链上逻辑 ===
从 ../demo/src/lib/monad.ts → src/lib/monad.ts
  这是最关键的文件，包含：
  - monadTestnet 链定义
  - CONTRACTS 对象（6 个已部署合约地址）
  - ERC20_ABI, QUOTER_V2_ABI, SWAP_ROUTER_ABI
  - publicClient
  - getBalances(address) — 查 MON + USDC
  - getQuote(tokenIn, tokenOut, amountIn, fee) — 调 QuoterV2 真实报价
  - getPrice() — MON/USDC 价格
  注意：QuoterV2 的 ABI 参数是 struct 格式，不是展开的 5 个参数

=== 前端 UI ===
从 ../packages/frontend/src/app/providers.tsx → src/app/providers.tsx
  Privy + wagmi + RainbowKit 完整配置

从 ../packages/frontend/src/app/page.tsx → src/app/page.tsx
  未登录→Onboarding，已登录→MainLayout

从 ../packages/frontend/src/app/globals.css → src/app/globals.css
  设计 token（颜色、圆角）

从 ../packages/frontend/src/app/components/Onboarding.tsx → src/app/components/Onboarding.tsx
从 ../packages/frontend/src/app/components/MainLayout.tsx → src/app/components/MainLayout.tsx
从 ../packages/frontend/src/app/components/TestnetBanner.tsx → src/app/components/TestnetBanner.tsx
从 ../packages/frontend/src/app/components/tabs/SwapTab.tsx → src/app/components/tabs/SwapTab.tsx
从 ../packages/frontend/src/app/components/tabs/AgentTab.tsx → src/app/components/tabs/AgentTab.tsx
从 ../packages/frontend/src/app/components/tabs/EarnTab.tsx → src/app/components/tabs/EarnTab.tsx

从 ../packages/frontend/src/hooks/useBalances.ts → src/hooks/useBalances.ts
  真实链上余额查询，改 import 指向 @/lib/monad

=== Agent 核心（服务端逻辑）===
从 ../packages/agent/src/core/intent-parser.ts → src/lib/agent/intent-parser.ts
  中英文意图解析，完整可用

从 ../packages/agent/src/core/strategy-engine.ts → src/lib/agent/strategy-engine.ts
  策略轮询框架

从 ../packages/agent/src/dex/types.ts → src/lib/agent/dex/types.ts
从 ../packages/agent/src/dex/aggregator.ts → src/lib/agent/dex/aggregator.ts
  DEX 聚合器

从 ../packages/agent/src/strategies/base-strategy.ts → src/lib/agent/strategies/base.ts
  策略基类

从 ../packages/agent/src/x402/client.ts → src/lib/agent/x402/client.ts
从 ../packages/agent/src/x402/budget-manager.ts → src/lib/agent/x402/budget-manager.ts
  x402 付费 + 预算管理

=== x402 服务端 ===
从 ../packages/server/src/lib/x402-server.ts → src/lib/x402-server.ts
从 ../packages/server/src/app/api/v1/health/route.ts → src/app/api/v1/health/route.ts

Step 4: 修复所有 import 路径
- 所有 @/lib/monad 指向新的 src/lib/monad.ts
- 所有合约地址统一用 monad.ts 里的 CONTRACTS
- 删掉对 packages/ 的引用
- 把 "OpenClaw" 品牌名改成 "ClawSwap"（UI 文本、注释）

Step 5: 更新 layout.tsx
- title 改为 "ClawSwap | AI Agent DEX on Monad"
- 用 Providers 包裹

Step 6: 创建 .env.example（参考 CLAWSWAP-FULL-SPEC.md 第 5 节）

Step 7: 创建 .gitignore
  node_modules, .next, .env, *.db, .turbo

验证：pnpm dev 跑起来，能看到 Onboarding 登录页。
  Privy 登录后能看到 MainLayout（Swap/Agent/Earn 三个 Tab）。
  Swap Tab 输入金额后能获取真实的链上报价（来自 monad.ts 的 getQuote）。
```

---

## Prompt 2: AA 钱包 + Session Key（全新实现）

```
在 ClawSwap 中实现 AA 智能钱包 + Session Key 授权系统。
这是全新代码，现有项目没有。

安装额外依赖：
pnpm add @zerodev/sdk @zerodev/ecdsa-validator @zerodev/permissions permissionless

=== 新写文件 ===

1. src/lib/smart-wallet.ts
   - createSmartWallet(privyEoaProvider):
     - Privy EOA → signerToEcdsaValidator → createKernelAccount → createKernelAccountClient
     - 配置 Bundler URL (从 env NEXT_PUBLIC_ZERODEV_BUNDLER_URL)
     - Paymaster 代付 gas（用户无需 MON）
     - 返回 { smartAccountAddress, kernelClient, account, publicClient }
   参考 CLAWSWAP-FULL-SPEC.md 4.1 节代码

2. src/lib/session-key.ts
   - createAgentSessionKey(publicClient, ownerAccount, config?):
     - generatePrivateKey() 生成 Agent 临时密钥
     - callPolicy 白名单：SwapRouter.exactInputSingle + USDC.approve
     - rateLimitPolicy：每小时最多 10 笔
     - validUntil：config.validForHours 小时后过期
     - serializePermissionAccount → 返回 { serializedSessionKey, agentAddress }
   - 导出 SessionKeyConfig 接口 + DEFAULT_SESSION_CONFIG
   - 合约地址用 monad.ts 的 CONTRACTS.SWAP_ROUTER 和 CONTRACTS.USDC
   参考 CLAWSWAP-FULL-SPEC.md 4.2 节代码

3. src/hooks/useSmartWallet.ts
   - useSmartWallet() hook
   - initWallet(): 登录后找到 Privy embedded wallet → createSmartWallet
   - authorizeAgent(config?): createAgentSessionKey → POST /api/v1/agent/authorize
   - revokeAgent(): POST /api/v1/agent/revoke
   - 返回 { login, logout, authenticated, user, smartWallet, loading, initWallet, authorizeAgent, revokeAgent }
   参考 CLAWSWAP-FULL-SPEC.md "useSmartWallet Hook" 部分

验证：
1. Privy 登录后控制台打印 AA 钱包地址
2. 调用 authorizeAgent() 能生成 Session Key 并 POST 到 /api/v1/agent/authorize
```

---

## Prompt 3: 数据库 + Agent API 端点

```
创建 ClawSwap 的数据库和 Agent API。

=== 数据库 ===

1. pnpm add @prisma/client
   npx prisma init --datasource-provider sqlite

2. prisma/schema.prisma — 4 个表：
   - User: id, privyUserId(unique), email?, twitterHandle?, smartWalletAddress?
   - AgentSession: id, userId, serializedSessionKey, status(active/paused/revoked), strategyType, strategyConfig(JSON), validUntil
   - Trade: id, userId, strategy, tokenIn/Out, amountIn/Out, txHash, status, reason
   - ApiCallLog: id, endpoint, paidAmount
   参考 CLAWSWAP-FULL-SPEC.md 4.7 节

3. npx prisma generate && npx prisma db push

4. src/lib/db.ts — PrismaClient 单例

=== 补完现有 API ===

5. src/app/api/v1/agent/authorize/route.ts
   现有：只是 console.log
   补完：
   - 验证请求来源（userId）
   - 加密 serializedSessionKey（用 SESSION_KEY_ENCRYPTION_SECRET）
   - 存入 AgentSession 表
   - 返回 { success, sessionId }

6. src/app/api/v1/agent/revoke/route.ts
   现有：只是 console.log
   补完：
   - 将 AgentSession.status 改为 "revoked"
   - 停止运行中的 Agent 实例
   - 返回 { success }

=== 新写 API ===

7. src/app/api/v1/agent/status/route.ts
   - GET ?userId=xxx
   - 读取 AgentSession 状态 + 最近 10 笔 Trade
   - 返回 { running, strategy, recentTrades, stats }

8. src/app/api/v1/agent/strategy/route.ts
   - POST { userId, strategyType: "dca", config: { amount, interval, ... } }
   - 更新 AgentSession.strategyConfig
   - 启动/重启 Agent 实例

9. src/app/api/v1/agent/history/route.ts
   - GET ?userId=xxx&limit=20
   - 从 Trade 表分页查询

10. src/app/api/v1/agent/stream/route.ts
    - SSE 端点
    - 注册到 Agent 事件系统
    - 实时推送：trade_executed, strategy_check, balance_update, risk_blocked
    参考 CLAWSWAP-FULL-SPEC.md 4.6 节

11. src/app/api/v1/agent/instruct/route.ts
    - POST { userId, instruction: "帮我买100U的MON" }
    - 调用 IntentParser 解析意图
    - 根据意图执行操作
    - 返回 Agent 回复文本

验证：
- POST /api/v1/agent/authorize 返回 sessionId
- GET /api/v1/agent/status 返回 Agent 状态
- GET /api/v1/agent/stream 能接收 SSE 事件
```

---

## Prompt 4: 补完 Agent 核心引擎

```
补完 ClawSwap 的 AI Agent 核心逻辑。这些文件已经从 packages/agent 搬过来了，但执行逻辑不完整。

=== 补完 DEX 适配器 ===

1. src/lib/agent/dex/clawswap-adapter.ts
   现有问题：合约地址和 ABI 和 demo 不一致
   补完：
   - 合约地址改用 monad.ts 的 CONTRACTS.QUOTER_V2 和 CONTRACTS.SWAP_ROUTER
   - ABI 改用 monad.ts 的 QUOTER_V2_ABI（struct 参数格式）和 SWAP_ROUTER_ABI
   - 或者直接调 monad.ts 的 getQuote() helper
   - 确保 buildSwapTx 用正确的 ABI 编码 exactInputSingle

=== 补完策略 ===

2. src/lib/agent/strategies/dca.ts
   现有：evaluate() 是空函数
   补完（参考 demo/page.tsx 第 124-197 行的 Agent 模拟逻辑）：
   - 检查是否到了执行时间（now - lastExecution >= intervalMs）
   - 调用 monad.ts 的 getQuote(CONTRACTS.USDC, CONTRACTS.WMON, amount) 获取真实报价
   - 返回 TradeSignal { action: "swap", tokenIn: USDC, tokenOut: WMON, amount, reason }
   - 跟踪 executionCount 和 totalSpent
   参考 CLAWSWAP-FULL-SPEC.md 4.4 节代码

3. src/lib/agent/strategies/stop-loss.ts（新写）
   - 每次 evaluate 调用 monad.ts 的 getPrice()
   - 计算 MON 价格（pricePerMon = 1 / monPerUsdc）
   - 达到 takeProfitPrice → 返回卖出 signal
   - 跌破 stopLossPrice → 返回卖出 signal
   - triggered 后不再重复
   参考 CLAWSWAP-FULL-SPEC.md 4.5 节代码

4. src/lib/agent/strategies/sniper.ts（新写框架）
   - 配置：buyAmountMON, minLiquidity, checkIntervalMs
   - evaluate() 里 TODO: 接入 nad.fun API 或链上 event 监听
   - 暂时 return null

=== 补完 Agent 钱包 ===

5. src/lib/agent/agent-wallet.ts
   现有问题：initFromSessionKey 是 TODO，bundler URL 写死
   补完：
   - import { deserializePermissionAccount } from "@zerodev/permissions"
   - initFromSessionKey(serialized): 反序列化 → createKernelAccountClient
   - bundler URL 从 process.env.ZERODEV_BUNDLER_URL 读取
   - getBalance() 用 monad.ts 的 publicClient 查链上余额

=== 补完 Agent 主引擎 ===

6. src/lib/agent/agent.ts
   现有问题：handleUserInstruction 里 sendTransaction 被注释，缺风控和事件系统
   补完：
   - start(): 调 wallet.initFromSessionKey → 注册 DEX adapter → 进入 runLoop
   - runLoop(): 每 10 秒遍历 strategies，有 signal 就 executeWithRiskCheck
   - executeWithRiskCheck(signal):
     - 单笔上限检查（maxTradeSize）
     - 日上限检查（dailyLimit）
     - 获取报价 → buildSwapTx → wallet.sendTransaction（真实发交易）
     - 记录 Trade 到 DB
   - handleInstruction(text): IntentParser → 解析 → 执行 → 返回结果
   - 事件系统: on(listener), emit(event) → SSE 端点订阅
   - stop(): 停止循环
   - getStatus(): 返回完整状态（running, strategies, recentTrades, balance）
   参考 CLAWSWAP-FULL-SPEC.md "Agent 主类" 部分

验证：
- Agent 初始化后能调用 getQuote 获取报价
- DCA 策略每隔 N 秒返回 TradeSignal
- StopLoss 策略在价格触发时返回 signal
```

---

## Prompt 5: 补完前端交互

```
补完 ClawSwap 前端的真实交互逻辑。UI 组件已经搬过来了，但内部逻辑是 mock 的。

=== 新写 Hooks ===

1. src/hooks/useQuote.ts（新写）
   封装 monad.ts 的 getQuote，加 500ms debounce：
   - useQuote(amountIn, direction) → { quoteOut, loading }
   - direction: "usdc_to_mon" | "mon_to_usdc"
   - 内部用 parseUnits 处理 decimals（USDC=6, MON=18）
   参考 CLAWSWAP-FULL-SPEC.md 4.3 节代码
   也可参考 demo/page.tsx 第 94-121 行的报价逻辑

2. src/hooks/useSwap.ts（新写）
   - useSwap() → { execute, loading, txHash, error }
   - execute(tokenIn, tokenOut, amountIn, slippage):
     - 通过 useSmartWallet 的 kernelClient 发交易
     - 构建 approve calldata（USDC approve → SwapRouter）
     - 构建 swap calldata（exactInputSingle）
     - sendBatchTransaction([approve, swap]) 一次完成
     - 返回 txHash
   - ABI 用 monad.ts 的 ERC20_ABI 和 SWAP_ROUTER_ABI

3. src/hooks/useAgent.ts（新写）
   - useAgent() → { status, startAgent, stopAgent, pauseAgent, sendInstruction }
   - startAgent(strategy, config):
     1. 调 useSmartWallet().authorizeAgent() 签发 Session Key
     2. POST /api/v1/agent/strategy 配置策略
     3. 更新 status
   - stopAgent(): POST /api/v1/agent/revoke
   - sendInstruction(text): POST /api/v1/agent/instruct → 返回回复
   - 定时轮询 GET /api/v1/agent/status（每 10 秒）

4. src/hooks/useAgentStream.ts（新写）
   - useAgentStream(userId) → { events, connected }
   - 连接 SSE /api/v1/agent/stream
   - 解析 event.data → 追加到 events 数组
   - 断线自动重连

=== 补完 SwapTab ===

5. src/app/components/tabs/SwapTab.tsx
   现有：UI 完整，handleSwap 为空，余额写死
   补完：
   - 报价：用 useQuote hook（内部调 monad.ts 的 getQuote）
   - 余额：用 useBalances hook（已有，真实数据）
   - Swap：用 useSwap hook
   - handleSwap → useSwap().execute()
   - 交易成功后调 useBalances().refetch() 刷新余额
   - Swap 按钮状态：余额不足→disabled / 正在交易→loading / 正常→可点

=== 补完 AgentTab ===

6. src/app/components/tabs/AgentTab.tsx
   现有：UI 完整（4 策略选择 + DCA 配置 + Dashboard + 对话），全是 mock
   补完：
   - "启动 Agent" 按钮 → useAgent().startAgent()
   - "停止" 按钮 → useAgent().stopAgent()
   - 活动日志 → useAgentStream() 的 events 实时渲染
   - 统计数据 → useAgent().status 里的数据
   - 自然语言输入 → useAgent().sendInstruction()
   - 删掉所有 setTimeout/mock 数据，换成真实 API 调用

=== 补完 EarnTab ===

7. src/app/components/tabs/EarnTab.tsx
   现有：UI 完整，数据写死
   补完：
   - 从 GET /api/v1/earn/stats 或 /api/v1/agent/status 读取真实 API 调用统计
   - 或者先保持 mock 数据（这个优先级最低）

验证：
- Swap Tab: 输入金额→看到真实报价→点 Swap→交易成功→余额变化
- Agent Tab: 选 DCA→配置→启动→看到实时日志→PnL 更新→能停止
- 自然语言: 输入 "帮我买10U的MON" → Agent 回复→确认→执行
```

---

## Prompt 6: x402 付费端点补完

```
补完 ClawSwap 的 x402 付费 API。

安装：pnpm add @x402/core @x402/evm @x402/next

=== x402 服务端已搬过来（src/lib/x402-server.ts），直接可用 ===

=== 补完付费端点 ===

1. src/app/api/v1/quote/route.ts
   现有：x402 付费验证完整，但报价是 mock（amountIn * 0.997）
   补完：
   - 从 query params 获取 tokenIn, tokenOut, amountIn
   - 把 tokenIn/Out 符号映射到 monad.ts 的 CONTRACTS 地址
   - 调用 monad.ts 的 getQuote(tokenInAddr, tokenOutAddr, amountInWei)
   - 返回真实报价 { amountOut, gasEstimate, route, dex: "ClawSwap" }
   - 记录 ApiCallLog 到 DB

2. src/app/api/v1/swap/route.ts
   现有：x402 付费验证完整，但 tx 构建是 mock
   补完：
   - 用 monad.ts 的 SWAP_ROUTER_ABI 和 encodeFunctionData 构建真实 calldata
   - 返回 { txData: { to: CONTRACTS.SWAP_ROUTER, data, value: "0", chainId: 10143 } }
   - 记录 ApiCallLog

3. src/app/api/v1/price/route.ts
   现有：返回 mock 价格 "1.05"
   补完：调用 monad.ts 的 getPrice()，返回真实 MON 价格

验证：
- curl 请求 /api/v1/quote 返回 402 Payment Required
- 附上 x402 payment header 后返回真实报价
```

---

## Prompt 7: 打磨 + 端到端测试

```
最终打磨 ClawSwap。

1. 品牌统一：
   - 所有 "OpenClaw" 改成 "ClawSwap"
   - Logo 文字更新
   - 页面 title/description 更新

2. 端到端测试流程：
   a. Twitter 登录 → 看到 AA 钱包地址
   b. 如果余额 0 → 看到 TestnetBanner 引导
   c. 充值后 → Swap Tab 输入 10 USDC → 看到 MON 报价 → Swap → 成功
   d. Agent Tab → 选 DCA → 每分钟 1 USDC → 启动 → Privy 确认
   e. 等 2 分钟 → 至少 2 条交易日志
   f. 停止 Agent → Session Key 撤销
   g. Earn Tab → 看到统计

3. 错误处理：
   - 网络错误 → toast 提示
   - Session Key 过期 → 提示重新授权
   - 余额不足 → Swap 按钮 disabled
   - Agent 执行失败 → 日志标红

4. 动画：
   - Tab 切换 fade
   - 新交易日志 slide-in + highlight
   - 数字变化 counter animation
   - Agent 状态 🟢/🔴 脉冲

5. 数字格式化：
   - USDC: 2 位小数
   - MON: 4 位小数
   - 百分比: 1 位小数
   - 正数绿色 +%，负数红色 -%

6. 移动端：
   - 内容区 max-w-lg 居中
   - Tab 栏移动端变底部导航（已在 MainLayout 实现）

7. 安全检查：
   - .env 在 .gitignore 里
   - Session Key 加密存储
   - API 端点验证用户身份
```

---

## 开发检查清单

```
Phase 1: 搬代码 + 跑起来 (Day 1)
  [ ] 创建 Next.js 项目 + 安装依赖
  [ ] 搬入 13 个 ✅ 文件
  [ ] 修复 import 路径
  [ ] pnpm dev 跑通
  [ ] Privy 登录可用
  [ ] getQuote 返回真实报价

Phase 2: AA 钱包 (Day 2)
  [ ] smart-wallet.ts 🆕
  [ ] session-key.ts 🆕
  [ ] useSmartWallet hook 🆕
  [ ] 登录后看到 AA 钱包地址
  [ ] 能签发 Session Key

Phase 3: 数据库 + API (Day 3)
  [ ] Prisma schema + db.ts 🆕
  [ ] authorize 补完 🔧
  [ ] revoke 补完 🔧
  [ ] status/strategy/history/instruct/stream 🆕

Phase 4: Agent 核心 (Day 4)
  [ ] clawswap-adapter 补完（用 demo 的 ABI）🔧
  [ ] DCA 策略补完 🔧
  [ ] StopLoss 策略 🆕
  [ ] agent-wallet 补完（Session Key 反序列化）🔧
  [ ] agent.ts 补完（风控 + 事件 + 真实执行）🔧

Phase 5: 前端交互 (Day 5)
  [ ] useQuote hook 🆕
  [ ] useSwap hook 🆕
  [ ] useAgent + useAgentStream hooks 🆕
  [ ] SwapTab 补完（真实 swap）🔧
  [ ] AgentTab 补完（真实 API）🔧
  [ ] EarnTab 补完 🔧

Phase 6: x402 (Day 6)
  [ ] quote 端点补完 🔧
  [ ] swap 端点补完 🔧
  [ ] price 端点补完 🔧

Phase 7: 打磨 (Day 7)
  [ ] 品牌改名 ClawSwap
  [ ] 动画 + 响应式
  [ ] 错误处理
  [ ] 端到端测试通过
```
