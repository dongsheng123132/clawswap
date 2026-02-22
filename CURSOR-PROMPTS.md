# Cursor 开发指令集

> 按顺序把以下 Prompt 复制到 Cursor 中执行。每完成一步，确认测试通过后再执行下一步。

---

## Prompt 1: 项目初始化

```
请帮我初始化一个叫 openclaw 的 monorepo 项目，使用 Turborepo + pnpm workspace。

项目结构：
openclaw/
├── packages/
│   ├── contracts/    # Foundry Solidity 项目
│   ├── agent/        # TypeScript Node.js 项目
│   ├── server/       # Next.js 14 App Router 项目
│   ├── frontend/     # Next.js 14 前端项目
│   └── sdk/          # TypeScript SDK 库
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── .env.example
└── .gitignore

要求：
1. 根 package.json 配置 workspaces
2. turbo.json 配置 build/dev/test pipeline
3. 每个子包都有独立的 tsconfig.json（除了 contracts）
4. contracts 用 forge init 初始化
5. agent 和 sdk 是纯 TypeScript 库（tsx 运行，vitest 测试）
6. server 和 frontend 是 Next.js 14 项目（App Router + Tailwind）
7. .env.example 包含所有环境变量（参考 TECH-SPEC.md 的 Phase 7）

请直接创建所有文件，不要跳过任何步骤。
```

---

## Prompt 2: Monad 链配置 + AA 智能钱包 + Session Key

```
在 OpenClaw 项目中实现 AA 智能钱包系统。我们不用裸私钥，而是用 Privy 社交登录 + ZeroDev Kernel AA 钱包 + Session Key 方案。

参考 TECH-SPEC.md Step 3.2 ~ 3.2d 和 ARCHITECTURE.md Section 2.2 的设计。

=== Part A: 通用链配置 ===

1. packages/agent/src/wallet/chains.ts
   - 用 viem defineChain 定义 Monad Testnet（Chain ID: 10143, RPC: https://testnet-rpc.monad.xyz）
   - 导出 MONAD_CONTRACTS 常量对象（USDC, Router 等合约地址）

2. packages/frontend/src/lib/chains.ts（同样的链定义）

=== Part B: 前端 — Privy 社交登录 + AA 钱包创建 ===

3. packages/frontend/src/app/providers.tsx
   - PrivyProvider 配置
   - 支持 Twitter / Email / Google 登录
   - embeddedWallets.createOnLogin = "users-without-wallets"
   - defaultChain = Monad Testnet

4. packages/frontend/src/lib/smart-wallet.ts
   - createSmartWallet(privyEoaProvider): 用 Privy EOA 作 signer → 创建 ZeroDev Kernel Account
   - 配置 Bundler + Paymaster（代付 gas）
   - 返回 smartAccountAddress + kernelClient

5. packages/frontend/src/lib/session-key.ts
   - createAgentSessionKey(publicClient, ownerAccount, config):
     - 生成临时密钥对
     - 定义 Policy（callPolicy 白名单合约 + rateLimitPolicy）
     - 创建 permissionValidator
     - serializePermissionAccount → 返回序列化的 Session Key

6. packages/frontend/src/hooks/useSmartWallet.ts
   - useSmartWallet() hook
   - initWallet(): 登录后创建 AA 钱包
   - authorizeAgent(): 签发 Session Key → POST 到 /api/v1/agent/authorize
   - revokeAgent(): 撤销 Agent 权限

=== Part C: Agent 服务端 — 使用 Session Key 交易 ===

7. packages/agent/src/wallet/agent-wallet.ts
   - AgentWallet class
   - initFromSessionKey(serialized): 反序列化 → 恢复受限 Kernel Client
   - sendTransaction(tx): 用 Session Key 发送交易（受 Policy 限制）
   - sendBatchTransaction(txs): 批量交易（approve + swap 一次完成）
   - getBalance(): 查询 AA 钱包余额

8. packages/server/src/app/api/v1/agent/authorize/route.ts
   - POST: 接收前端传来的 serializedSessionKey，加密存储

9. packages/server/src/app/api/v1/agent/revoke/route.ts
   - POST: 删除存储的 Session Key，Agent 停止交易

依赖：
- 前端: @privy-io/react-auth @zerodev/sdk @zerodev/ecdsa-validator @zerodev/permissions permissionless viem
- Agent: @zerodev/sdk @zerodev/permissions permissionless viem

关键安全点：
- Agent 永远不接触用户私钥，只有受限的 Session Key
- Session Key 的 Policy 在链上强制执行，无法绕过
- 用户随时可撤销

请确保代码类型安全，严格模式，不用 any。
```

---

## Prompt 3: Fork Uniswap V3 合约

```
在 packages/contracts 中 fork Uniswap V3 并适配 Monad：

1. 安装依赖：
   forge install Uniswap/v3-core --no-git
   forge install Uniswap/v3-periphery --no-git
   forge install OpenZeppelin/openzeppelin-contracts@v3.4.2 --no-git

2. 创建合约：
   src/core/OpenClawFactory.sol — 继承/复制 UniswapV3Factory，改名
   src/core/OpenClawPool.sol — 继承/复制 UniswapV3Pool，改名
   src/periphery/SwapRouter.sol — 复制 SwapRouter
   src/periphery/Quoter.sol — 复制 QuoterV2
   src/periphery/NonfungiblePositionManager.sol — 复制 NFPM

3. 修改点：
   - 所有合约内部引用改为 OpenClaw 版本
   - Fee tier 支持: 500 (0.05%), 3000 (0.3%), 10000 (1%)
   - solc 版本 0.7.6，optimizer 200 runs

4. 部署脚本 script/Deploy.s.sol：
   - 部署顺序：Factory → Router → PositionManager → Quoter
   - 需要 WMON 地址和 deployer 私钥
   - console.log 输出所有部署地址

5. 测试 test/OpenClawSwap.t.sol：
   - 测试 Factory 创建池
   - 测试添加流动性
   - 测试 swap

foundry.toml 配置：
  solc_version = "0.7.6"
  evm_version = "paris"
  optimizer = true
  optimizer_runs = 200

注意：Uniswap V3 合约依赖复杂，fork 时要确保 import 路径正确。可以使用 remapping 来处理。
```

---

## Prompt 4: DEX Aggregator

```
在 packages/agent/src/dex/ 中实现 DEX 聚合模块：

1. types.ts — 定义接口：
   - Quote: { dex, amountOut, priceImpact, route, estimatedGas }
   - SwapParams: { tokenIn, tokenOut, amountIn, slippage, recipient, deadline }
   - DEXAdapter 接口: { name, getQuote, buildSwapTx, getSupportedPairs }

2. aggregator.ts — DEX 聚合器：
   - registerDEX(adapter) 注册适配器
   - getBestQuote() 并行查询所有 DEX，返回最优报价
   - executeSwap() 使用最优路径执行交易
   - 考虑 gas 成本的净收益排序

3. openclaw-adapter.ts — 自建 AMM 适配器：
   - 调用 Quoter 合约获取报价
   - 构建 SwapRouter exactInputSingle calldata
   - 使用 viem encodeFunctionData

4. 后续可扩展的外部 DEX 适配器接口（先写空壳）：
   - kuru-adapter.ts（Kuru DEX）
   - pancake-adapter.ts（PancakeSwap V4）

5. tests/aggregator.test.ts：
   - Mock DEX adapter，测试最优报价选择逻辑
   - 测试单 DEX 和多 DEX 场景

请参考 TECH-SPEC.md Step 3.4 ~ 3.5 的代码。
```

---

## Prompt 5: Agent Core

```
在 packages/agent/src/core/ 中实现 Agent 核心：

1. agent.ts — OpenClawAgent 主类：
   - constructor(config: AgentConfig) 初始化钱包、聚合器、策略
   - start() 启动 Agent（创建/加载钱包，进入主循环）
   - stop() 优雅停止
   - handleUserInstruction(text: string) 处理自然语言指令
   - 自主模式：每 10 秒检查策略触发条件
   - 辅助模式：等待用户指令

2. intent-parser.ts — 意图解析器：
   - parseSwapIntent("买100U的MON") → { action: "swap", tokenIn: "USDC", tokenOut: "MON", amount: 100 }
   - parseBalanceIntent("查看余额") → { action: "balance" }
   - 使用简单的正则 + 关键词匹配（先不接 LLM，后续可替换）
   - 支持中英文指令

3. strategy-engine.ts — 策略引擎：
   - 注册策略列表
   - 轮询所有策略的 evaluate() 方法
   - 收到 signal 时通过风控检查再执行

4. src/strategies/base-strategy.ts — 策略基类
5. src/strategies/dca.ts — DCA 定投策略
6. src/strategies/stop-loss.ts — 止盈止损策略

7. 风控规则：
   - 单笔金额上限（config.limits.maxTradeSize）
   - 日累计上限（config.limits.dailyLimit）
   - 滑点上限（config.limits.maxSlippage）
   - 风控不通过 → 跳过交易 + 记录日志

8. 入口文件 src/index.ts：
   - 导出 OpenClawAgent + 所有策略 + WalletManager + DEXAggregator
   - 可以通过 npx tsx src/index.ts 启动 Agent

参考 TECH-SPEC.md Step 3.6 ~ 3.7 的代码。
```

---

## Prompt 6: x402 Server

```
在 packages/server 中搭建 x402 付费 API 服务：

依赖安装：
pnpm add @x402/core @x402/evm @x402/next viem

1. src/lib/x402-server.ts — x402 服务端配置：
   - 配置 HTTPFacilitatorClient (URL: https://x402-facilitator.molandak.org)
   - 配置 x402ResourceServer
   - 注册 Monad ExactEvmScheme
   - registerMoneyParser: 金额 → USDC token amount (6 decimals)
   - Network: "eip155:10143"
   - USDC: "0x534b2f3A21130d7a60830c2Df862319e593943A3"

2. src/lib/monad.ts — Monad 配置

3. 付费端点：
   src/app/api/v1/quote/route.ts — 报价 API ($0.0001/次)
     GET /api/v1/quote?tokenIn=USDC&tokenOut=MON&amountIn=100
     返回: { amountOut, route, dex, priceImpact, estimatedGas }

   src/app/api/v1/swap/route.ts — 交易 API ($0.001/次)
     POST /api/v1/swap { tokenIn, tokenOut, amountIn, walletAddress, slippage }
     返回: { txData: { to, data, value, chainId } }

4. 免费端点：
   src/app/api/v1/price/route.ts — 价格查询
   src/app/api/v1/health/route.ts — 健康检查

5. 所有付费端点使用 withX402() 包裹
   PAY_TO 地址从 env 读取

参考 TECH-SPEC.md Phase 4 和 Monad x402 guide 的代码。
注意 @x402 包版本要 >= 2.2.0。
```

---

## Prompt 7: x402 Client（Agent 付费消费）

```
在 packages/agent/src/x402/ 中实现 x402 客户端：

1. client.ts — x402 付费 fetch 封装：
   - createX402Fetch(walletSigner) 返回增强版 fetch
   - 自动处理 402 响应 → 签名付款 → 重试请求
   - 使用 @x402/fetch 的 wrapFetchWithPayment
   - 注册 Monad 网络的 ExactEvmScheme

2. budget-manager.ts — 预算管理：
   - 跟踪每次 x402 付费金额
   - 单次付费上限（默认 $0.01）
   - 日累计上限（默认 $1.00）
   - 超过上限时拒绝付费并告警
   - 白名单域名管理

3. 集成到 Agent：
   - Agent 初始化时创建 x402Fetch
   - Agent 调用外部 API 时使用 x402Fetch
   - 调用自己的 server 端点也用 x402Fetch（测试端到端）

4. 测试：
   - 测试 budget manager 的限额逻辑
   - 测试 x402 fetch 的 402 处理流程（可 mock server）
```

---

## Prompt 8: 前端 Swap 界面

```
在 packages/frontend 中实现 DEX 前端：

技术栈：Next.js 14 + Tailwind CSS + wagmi + viem + RainbowKit + shadcn/ui

1. wagmi 配置：
   - 定义 Monad Testnet chain
   - RainbowKit 钱包连接

2. src/app/swap/page.tsx — Swap 页面（参考 Uniswap 界面风格）：
   - 暗色主题，紫色主色调
   - 上方：输入代币 + 金额
   - 中间：方向切换按钮（↕️）
   - 下方：输出代币 + 预估金额
   - Token 选择器（弹窗，支持搜索）
   - 信息栏：价格影响、手续费、最小收到数量、滑点设置
   - Swap 按钮（未连接钱包时显示"Connect Wallet"）
   - 交易确认弹窗 → 等待签名 → pending → confirmed

3. src/app/pool/page.tsx — 流动性页面：
   - 显示当前 LP 仓位
   - 添加流动性表单
   - 移除流动性表单

4. src/components/：
   - SwapCard.tsx — Swap 卡片主组件
   - TokenSelector.tsx — 代币选择器
   - TransactionStatus.tsx — 交易状态显示
   - Header.tsx — 导航栏（Logo + 钱包连接）

5. src/hooks/：
   - useQuote.ts — 调用 Quoter 获取实时报价（debounced）
   - useSwap.ts — 执行 swap（approve + swap）
   - useTokenList.ts — 代币列表

界面要漂亮、动画流畅、交互丝滑。参考 Uniswap 最新版的 UI 风格。
```

---

## Prompt 9: Agent Dashboard

```
在 packages/frontend 中新增 Agent 控制面板页面：

src/app/agent/page.tsx — Agent Dashboard：

1. 左侧面板 — Agent 状态
   - 运行状态指示器（绿色运行中 / 红色已停止）
   - 钱包地址（可复制）
   - 钱包余额（MON + USDC + 其他持仓）
   - 启动/停止按钮

2. 中间面板 — 策略管理
   - 策略列表（DCA、止盈止损等）
   - 每个策略的配置卡片（可编辑参数）
   - 策略开关（启用/停用）
   - "添加策略"按钮

3. 右侧面板 — 交易日志
   - 实时交易历史表格
   - 每笔显示：时间、类型、代币对、数量、价格、PnL、tx hash
   - 总 PnL 统计

4. 底部 — 自然语言指令
   - 聊天式输入框
   - 用户输入"买100U的MON" → 显示 Agent 回复
   - 显示 Agent 执行的步骤（报价 → 确认 → 执行 → 结果）

使用 shadcn/ui 组件，暗色主题，响应式布局。
```

---

## Prompt 10: SDK 封装

```
在 packages/sdk 中封装对外 SDK：

1. src/client.ts — OpenClawSDK 主类：
   - constructor({ apiUrl, walletPrivateKey? })
   - 如果有 walletPrivateKey → 自动启用 x402 付费
   - getQuote(tokenIn, tokenOut, amountIn) → Quote
   - executeSwap(params) → SwapResult
   - getPrice(token) → PriceInfo

2. src/types.ts — 完整类型定义

3. src/index.ts — 统一导出

4. package.json：
   - name: "@openclaw/sdk"
   - main: "dist/index.js"
   - types: "dist/index.d.ts"
   - tsup 打包

5. README.md 使用示例：
   ```ts
   import { OpenClawSDK } from "@openclaw/sdk";

   const sdk = new OpenClawSDK({
     apiUrl: "https://api.openclaw.xyz",
     walletPrivateKey: "0x..."
   });

   // 获取报价（自动通过 x402 付费 $0.0001）
   const quote = await sdk.getQuote("USDC", "MON", "100");

   // 执行交易（自动付费 $0.001）
   const result = await sdk.executeSwap({
     tokenIn: "USDC",
     tokenOut: "MON",
     amountIn: "100",
     walletAddress: "0x...",
   });
   ```
```

---

## 通用规则（每个 Prompt 都适用）

给 Cursor 的每个 prompt 开头可以加上这段上下文：

```
你正在开发 OpenClaw 项目 — 一个 Monad 上的 AI Agent DEX 平台。
请参考项目根目录下的以下文档：
- PRD.md — 产品需求
- ARCHITECTURE.md — 系统架构
- TECH-SPEC.md — 技术规范
- ROADMAP.md — 开发路线图

技术栈：
- 合约：Solidity 0.7.6 + Foundry（fork Uniswap V3）
- Agent：TypeScript + viem + @x402 SDK
- Server：Next.js 14 App Router + @x402/next
- 前端：Next.js 14 + wagmi + viem + RainbowKit + Tailwind + shadcn/ui
- 测试：vitest（TS）+ forge test（Solidity）

Monad 配置：
- Chain ID: 10143 (CAIP-2: eip155:10143)
- RPC: https://testnet-rpc.monad.xyz
- USDC: 0x534b2f3A21130d7a60830c2Df862319e593943A3
- x402 Facilitator: https://x402-facilitator.molandak.org

代码规范：
- TypeScript 严格模式，不用 any
- 所有函数有返回类型标注
- 异步操作用 async/await
- 错误处理用 try/catch + 有意义的错误消息
- 使用 viem（不用 ethers.js）
```
