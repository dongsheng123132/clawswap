# x402 Payment Grid — 开发经验总结

## 1. 项目背景

在 Monad Testnet 上实现一个 3x3 Grid 支付测试工具，验证三种支付方式：
- **USDC** — ERC20 直接转账
- **MON** — 原生代币转账
- **x402** — 基于 USDC 转账的 x402 协议模拟

核心目标：测试 x402 支付在 Monad 上的可行性，Grid 是交互载体。

## 2. 架构设计

```
Frontend (GridTab)                    Server API
┌──────────────┐                 ┌──────────────────┐
│ 3x3 Grid     │ ──GET /grid──> │ 返回 9 个格子状态   │
│ PaymentModal │                 │                   │
│  - USDC      │ ──POST /grid── │ 链上验证 tx        │
│  - MON       │   /purchase    │ 标记已购买          │
│  - x402      │                │                   │
└──────────────┘                 └──────────────────┘
```

**关键决策**：
- 不信任客户端 — 服务端通过 `getTransactionReceipt()` 链上验证
- 收款地址固定为 deployer: `0x408E2fC4FCAF2D38a6C9dcF07C6457bdFb6e0250`
- 定价: USDC 0.01 (6 decimals) / MON 0.001 (18 decimals)

## 3. 数据库模型

```prisma
model GridCell {
  id        String   @id @default(cuid())
  index     Int      @unique          // 0-8
  color     String   @default("#7C3AED")
  label     String?
  ownerId   String?                   // 买家地址
  ownerAddr String?
  price     String   @default("0.01")
  payMethod String?                   // "USDC" | "MON" | "x402"
  txHash    String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

Lazy init: 首次 GET 请求时自动创建 9 个空格子。

## 4. 链上验证逻辑

### MON 支付验证
```typescript
const tx = await publicClient.getTransaction({ hash: txHash });
const toMatch = tx.to?.toLowerCase() === PAY_TO_ADDRESS.toLowerCase();
const valueOk = tx.value >= MON_PRICE; // 0.001 MON
```

### USDC/x402 支付验证
解析 ERC20 Transfer 事件日志：
```typescript
const transferLogs = receipt.logs.filter(
  (log) => log.address.toLowerCase() === CONTRACTS.USDC.toLowerCase()
);
// decodeEventLog → 检查 to === PAY_TO_ADDRESS && value >= 0.01 USDC
```

## 5. 前端钱包交互模式

复用 SwapTab 的 Privy EOA 模式：
```typescript
await wallets[0].switchChain(10143);
const provider = await wallets[0].getEthereumProvider();
const walletClient = createWalletClient({ chain: monadTestnet, transport: custom(provider) });
```

- MON: `walletClient.sendTransaction({ to, value })`
- USDC/x402: `walletClient.writeContract({ functionName: 'transfer', args: [to, amount] })`

## 6. 文件清单

| 文件 | 类型 | 说明 |
|------|------|------|
| `packages/server/prisma/schema.prisma` | 修改 | 新增 GridCell model |
| `packages/server/src/app/api/v1/grid/route.ts` | 新建 | GET 获取所有格子 |
| `packages/server/src/app/api/v1/grid/purchase/route.ts` | 新建 | POST 购买 + 链上验证 |
| `packages/frontend/src/hooks/useGrid.ts` | 新建 | Grid 数据 hook |
| `packages/frontend/src/app/components/tabs/GridTab.tsx` | 新建 | 3x3 Grid + 支付弹窗 |
| `packages/frontend/src/app/components/MainLayout.tsx` | 修改 | 添加 Grid tab |

## 7. 踩坑记录 & 注意事项

1. **DATABASE_URL 在根目录 `.env`**：Prisma 在 `packages/server/` 下但没有自己的 `.env`，需要 `export` 根目录变量后才能 `db push`
2. **x402 SDK 不可用**：`@x402/core` exports 不兼容，`x402-server.ts` 仍是 stub。Grid 的 x402 选项实际走 USDC transfer + 标记为 x402
3. **合约地址不一致**：`packages/server/src/lib/monad.ts` 和 `packages/frontend/src/lib/chains.ts` 的地址可能是旧的（参考 CLAUDE.md），Grid 功能不依赖 Uniswap 合约，只用 USDC 地址
4. **Neon PostgreSQL**：数据库是 Neon 托管的 PostgreSQL（非 SQLite），`prisma db push` 成功后自动 generate client
5. **简化设计**：原计划 10x10 (100格) 太复杂，缩减为 3x3 (9格) MVP，聚焦支付测试核心功能
