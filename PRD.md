# PRD: OpenClaw — Monad DEX + x402 AI Agent 平台

## 1. 产品概述

**产品名称**: OpenClaw
**一句话描述**: 一个运行在 Monad 上的自主 AI 交易 Agent 平台，自建 DEX + 聚合已有 DEX 流动性，通过 x402 协议实现 Agent 经济体。

### 1.1 核心价值主张

- **AI Agent 自主交易**: Agent 自动创建钱包、分析行情、在 DEX 上执行 swap 策略
- **用户代理交易**: 用户通过自然语言告诉 Agent "买 100U 的 MON"，Agent 自动寻找最优路径执行
- **x402 API 经济**: 对外出售交易 API（按次收费），Agent 也能自动付费购买外部数据/服务
- **DEX 聚合器**: 自建 AMM 池 + 聚合 Monad 上其他 DEX，为用户和 Agent 找到最优价格

### 1.2 目标用户

| 用户类型 | 描述 | 核心需求 |
|---------|------|---------|
| AI Agent 开发者 | 想让自己的 Agent 能在 Monad 上交易 | 简单的 SDK/API 调用即可 swap |
| 普通交易者 | 在 Monad 上交易代币的人 | 好用的 swap 界面、最优价格 |
| 策略交易者 | 想运行自动化策略的人 | Agent 自主执行策略、止盈止损 |
| API 消费者 | 其他 AI Agent 调用 OpenClaw 的付费 API | 通过 x402 自动付费获取数据/执行交易 |

---

## 2. 功能需求

### 2.1 P0 — MVP（第一阶段，4 周）

#### 2.1.1 钱包管理模块（AA 智能钱包 + Session Key）
- [ ] 用户通过 Twitter / Email / Google 社交登录（Privy）
- [ ] 自动创建 ERC-4337 AA 智能合约钱包（ZeroDev Kernel）
- [ ] 用户授权 Agent：签发 Session Key（受限权限）
  - 合约白名单（只能调用 DEX Router + USDC approve）
  - 单笔上限（默认 100 USDC）、日上限（默认 1,000 USDC）
  - 有效期（默认 24 小时，可续签）
  - 频率限制（每小时最多 10 笔）
- [ ] 用户一键撤销 Agent Session Key
- [ ] 查询 AA 钱包余额（MON、USDC、任意 ERC-20）
- [ ] Paymaster 代付 gas（用户不需要 MON）
- [ ] 社交恢复（丢失设备后用 Twitter/Email 重新登录恢复钱包）

#### 2.1.2 DEX Swap 核心
- [ ] Fork Uniswap V3 合约部署到 Monad testnet
  - Factory、Pool、SwapRouter、NonfungiblePositionManager
  - 支持集中流动性（concentrated liquidity）
- [ ] 基础 Swap 功能：exactInput / exactOutput
- [ ] 自动 approve token → Router
- [ ] Slippage 保护（默认 0.5%，可配置）
- [ ] 交易 gas 估算

#### 2.1.3 DEX 聚合
- [ ] 接入 Monad 上已有 DEX（Kuru、PancakeSwap V4 等）Router
- [ ] 多 DEX 报价比较，选择最优价格执行
- [ ] 路由算法：支持多跳（A → B → C）

#### 2.1.4 AI Agent 核心
- [ ] 自然语言指令解析（"帮我买 50U 的 MON"）
- [ ] 自主交易模式（基于简单规则：定投、网格、止盈止损）
- [ ] 交易执行引擎：解析指令 → 报价 → 确认 → 执行 → 通知
- [ ] 交易历史记录 & 损益统计

#### 2.1.5 x402 支付 — 服务端（卖 API）
- [ ] 付费端点：`/api/v1/quote`（获取报价，$0.0001/次）
- [ ] 付费端点：`/api/v1/swap`（执行交易，$0.001/次）
- [ ] 付费端点：`/api/v1/price`（实时价格，$0.0001/次）
- [ ] x402 中间件集成（@x402/next）
- [ ] 使用 Monad facilitator 结算 USDC

#### 2.1.6 x402 支付 — 客户端（买服务）
- [ ] Agent 自动通过 x402 付费调用外部 API
- [ ] 支持调用任意 x402-enabled 的服务
- [ ] 付费预算管理（单次上限、日上限）

### 2.2 P1 — 增强功能（第二阶段，4 周）

- [ ] 前端 swap 界面（Next.js + RainbowKit）
- [ ] 流动性管理界面（添加/移除/调整 LP 仓位）
- [ ] Agent 高级策略（套利、MEV、跟单）
- [ ] 多 Agent 协作（一个 Agent 做分析，一个 Agent 做执行）
- [ ] x402 自建 facilitator（不依赖第三方，主网用）
- [ ] Agent dashboard（实时查看 Agent 状态、持仓、PnL）

### 2.3 P2 — 生态扩展（第三阶段）

- [ ] Agent marketplace（其他人可以部署自己的策略 Agent）
- [ ] 跨链 swap（Monad ↔ Base ↔ Ethereum）
- [ ] 更多 DeFi 协议集成（借贷、质押）
- [ ] 移动端 App

---

## 3. 非功能需求

| 指标 | 要求 |
|------|------|
| Swap 延迟 | < 2 秒（Monad 出块 400ms） |
| Agent 响应时间 | 自然语言指令 → 执行完成 < 5 秒 |
| 交易成功率 | > 99%（含自动重试） |
| 安全性 | 私钥永不明文存储/传输、交易金额上限可配 |
| 可用性 | 99.5% uptime |
| x402 结算 | 支付验证 < 500ms |

---

## 4. 用户流程

### 4.1 Agent 自主交易流程

```
用户 Twitter/Email 登录 → 自动创建 AA 钱包
    ↓
用户存入 USDC 到 AA 钱包
    ↓
用户配置策略参数（如："每天定投10U买MON"）
    ↓
用户点击"启用 Agent" → Privy 弹窗确认 → 签发 Session Key
    ↓
Session Key 传到 Agent 服务器（权限受限：白名单合约+金额上限）
    ↓
Agent 启动 → 用 Session Key 操作用户的 AA 钱包
    ↓
到达触发时间 → Agent 调用报价引擎
    ↓
比较自建 DEX 和聚合 DEX 的价格
    ↓
选择最优路径 → 用 Session Key 发送 UserOperation → swap
    ↓ （Paymaster 代付 gas，用户不需要 MON）
记录交易 → 计算 PnL → 通知用户
    ↓
用户随时可在 Dashboard 撤销 Session Key → Agent 立即停止
```

### 4.2 用户自然语言交易流程

```
用户: "帮我把 100 USDC 换成 MON"
    ↓
Agent 解析意图: swap(100 USDC → MON)
    ↓
Agent 获取报价: 100 USDC ≈ 250 MON（含 0.5% slippage）
    ↓
Agent 回复: "当前价格 1 MON ≈ 0.4 USDC，100U 可换约 250 MON，确认执行？"
    ↓
用户: "确认" / "换 50U 就好"
    ↓
Agent 执行 swap → 返回交易 hash
```

### 4.3 x402 API 调用流程（外部 Agent 调用 OpenClaw）

```
外部 Agent: GET /api/v1/quote?from=USDC&to=MON&amount=100
    ↓
OpenClaw 服务器: 402 Payment Required
  { scheme: "exact", network: "eip155:10143", price: "$0.0001", asset: "USDC" }
    ↓
外部 Agent 自动签名支付 0.0001 USDC
    ↓
Facilitator 验证 + 链上结算
    ↓
OpenClaw 返回报价数据:
  { bestPrice: "0.40", route: "USDC→MON", dex: "OpenClaw AMM", slippage: "0.5%" }
```

---

## 5. 成功指标

| 指标 | MVP 目标 | 3个月目标 |
|------|---------|----------|
| 日交易量 | $10K | $100K |
| Agent 创建钱包数 | 100 | 1,000 |
| x402 API 日调用量 | 1,000 次 | 50,000 次 |
| x402 API 日收入 | $1 | $50 |
| DEX TVL | $50K | $500K |
