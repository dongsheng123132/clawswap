# 开发路线图 & 里程碑

## Phase 1: 基础设施（Week 1）

### Milestone 1.1: 项目骨架 ✅ 验收标准：pnpm install + pnpm build 成功
- [ ] 创建 monorepo（Turborepo + pnpm workspace）
- [ ] 初始化 5 个子包：contracts, agent, server, frontend, sdk
- [ ] 配置 TypeScript、ESLint、Prettier
- [ ] 配置 .env.example

### Milestone 1.2: 链连接 ✅ 验收标准：能查到 Monad testnet 余额
- [ ] 定义 Monad Testnet chain（viem defineChain）
- [ ] 配置 publicClient + walletClient
- [ ] 编写测试：查询任意地址的 MON 余额
- [ ] 编写测试：查询 USDC 余额（ERC-20 balanceOf）

### Milestone 1.3: AA 钱包 + Session Key ✅ 验收标准：社交登录→创建 AA 钱包→签发 Session Key→Agent 用 Session Key 查余额
- [ ] Privy 社交登录集成（Twitter / Email / Google）
- [ ] ZeroDev Kernel 智能合约钱包创建
- [ ] Paymaster 代付 gas 配置
- [ ] Session Key 签发（白名单合约 + 金额上限 + 时间限制 + 频率限制）
- [ ] Session Key 序列化 → 传输到 Agent 服务器
- [ ] Agent 用 Session Key 恢复受限 Kernel Client
- [ ] Agent 查询 AA 钱包余额
- [ ] Session Key 撤销功能
- [ ] 单元测试全部通过

---

## Phase 2: 智能合约（Week 2）

### Milestone 2.1: 合约 Fork ✅ 验收标准：forge test 全部通过
- [ ] Fork Uniswap V3 Core（Factory, Pool）
- [ ] Fork Uniswap V3 Periphery（Router, Quoter, PositionManager）
- [ ] 重命名为 OpenClaw 品牌
- [ ] 本地 Foundry 测试全部通过

### Milestone 2.2: 合约部署 ✅ 验收标准：所有合约在 Monad testnet 上已验证
- [ ] 编写部署脚本（Deploy.s.sol）
- [ ] 部署到 Monad testnet
- [ ] 验证合约（explorer）
- [ ] 记录所有合约地址到 .env

### Milestone 2.3: 初始流动性 ✅ 验收标准：USDC/WMON 池有流动性，能 swap
- [ ] 创建 USDC/WMON 交易对
- [ ] 添加初始流动性
- [ ] 手动测试一次 swap（用 cast 命令行）

---

## Phase 3: DEX 聚合 + Agent 交易（Week 3）

### Milestone 3.1: DEX 适配器 ✅ 验收标准：能从自建 DEX 获取报价
- [ ] 实现 OpenClawAdapter（报价 + swap calldata 构建）
- [ ] 实现 DEXAggregator（多 DEX 比价框架）
- [ ] 编写测试：获取 USDC→MON 报价

### Milestone 3.2: Agent Swap ✅ 验收标准：Agent 能自动完成一次 swap
- [ ] Agent 创建钱包
- [ ] Agent 调用 aggregator 获取报价
- [ ] Agent approve + 执行 swap
- [ ] Agent 记录交易结果
- [ ] 端到端测试通过

### Milestone 3.3: 策略引擎 ✅ 验收标准：DCA 策略能按时间间隔自动买入
- [ ] BaseStrategy 接口定义
- [ ] DCA（定投）策略实现
- [ ] 策略引擎集成到 Agent 主循环
- [ ] 模拟 DCA 运行 5 个周期的测试

---

## Phase 4: x402 支付（Week 4）

### Milestone 4.1: x402 Server ✅ 验收标准：curl 调用返回 402，付费后返回数据
- [ ] Next.js server 搭建
- [ ] x402 中间件配置（Monad scheme）
- [ ] /api/v1/quote 付费端点
- [ ] /api/v1/swap 付费端点
- [ ] /api/v1/price 免费端点
- [ ] 用 curl 手动测试 402 响应

### Milestone 4.2: x402 Client ✅ 验收标准：Agent 能自动付费调用 x402 API
- [ ] x402 fetch 封装（wrapFetchWithPayment）
- [ ] Budget Manager（预算管理）
- [ ] Agent 集成 x402 client
- [ ] 测试：Agent 调用自己的付费 API

### Milestone 4.3: 端到端 x402 流程 ✅ 验收标准：外部 Agent 付费调用 OpenClaw API
- [ ] 模拟外部 Agent 调用 /api/v1/quote
- [ ] 自动 402 → 付费 → 获取数据
- [ ] Facilitator 链上结算确认
- [ ] 收款钱包收到 USDC

---

## Phase 5: 前端 + SDK（Week 5-6）

### Milestone 5.1: Swap 界面
- [ ] RainbowKit 钱包连接（支持 MetaMask、WalletConnect）
- [ ] Token 选择器组件
- [ ] Swap 卡片组件（输入 → 报价 → 确认 → 交易）
- [ ] 交易状态跟踪

### Milestone 5.2: Agent Dashboard
- [ ] Agent 状态面板（运行中/已停止）
- [ ] 钱包信息（地址、余额）
- [ ] 策略列表（可启用/停用）
- [ ] 交易历史表格
- [ ] 自然语言指令输入

### Milestone 5.3: SDK 发布
- [ ] OpenClawSDK 类封装
- [ ] 完整 TypeDoc 文档
- [ ] npm 发布（@openclaw/sdk）
- [ ] README 使用示例

---

## 时间线总览

```
Week 1: 基础设施 + 钱包
        ├── monorepo 初始化
        ├── Monad chain 配置
        └── Wallet Manager

Week 2: 智能合约
        ├── Fork Uniswap V3
        ├── 部署到 Monad testnet
        └── 创建初始流动性池

Week 3: Agent 交易引擎
        ├── DEX Adapter + Aggregator
        ├── Agent 自主交易
        └── DCA 策略

Week 4: x402 支付体系
        ├── x402 Server（卖 API）
        ├── x402 Client（买服务）
        └── 端到端测试

Week 5-6: 前端 + SDK
        ├── Swap 界面
        ├── Agent Dashboard
        └── SDK 发布
```
