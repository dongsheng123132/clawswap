# x402 Payment Integration — 开发经验总结

## 1. 项目背景

在 Monad Testnet 上实现真正的 x402 协议支付测试。通过 3x3 Grid 提供 3 种支付方式：
- **USDC** — ERC20 直接转账（链上验证）
- **MON** — 原生代币转账（链上验证）
- **x402** — 真正的 x402 协议流程（EIP-712 签名 → facilitator 结算）

## 2. x402 协议核心流程

```
Client                          Server                     Facilitator
  │                                │                           │
  │── GET /x402-test ──────────>   │                           │
  │                                │                           │
  │<── 402 + PAYMENT-REQUIRED ──   │                           │
  │   (price, network, payTo)      │                           │
  │                                │                           │
  │── signTypedData (EIP-712) ──>  │                           │
  │                                │                           │
  │── GET + PAYMENT-SIGNATURE ──>  │                           │
  │                                │── verify(payload) ──────> │
  │                                │<── { success: true } ──── │
  │                                │── settle(payload) ──────> │
  │                                │<── { tx: "0x..." } ────── │
  │<── 200 + content ────────────  │                           │
```

关键点：用户只需要**签名**（不是发交易），facilitator 负责链上结算。

## 3. Monad x402 配置

| 配置项 | 值 |
|--------|-----|
| Network ID | `eip155:10143` |
| USDC 地址 | `0x534b2f3A21130d7a60830c2Df862319e593943A3` |
| Facilitator URL | `https://x402-facilitator.molandak.org` |
| Scheme | `exact` |
| 官方文档 | https://docs.monad.xyz/guides/x402-guide |

## 4. 服务端实现（`@x402/next`）

```typescript
// x402-server.ts — 初始化
import { x402ResourceServer, HTTPFacilitatorClient } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';

const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const monadScheme = new ExactEvmScheme();
monadScheme.registerMoneyParser(async (amount, network) => {
  if (network === 'eip155:10143') {
    return { amount: Math.floor(amount * 1_000_000).toString(), asset: MONAD_USDC, extra: { name: 'USDC', version: '2' } };
  }
  return null;
});
export const x402Server = new x402ResourceServer(facilitatorClient);
x402Server.register('eip155:10143', monadScheme);

// route.ts — 用 withX402 包装
import { withX402 } from '@x402/next';
export const GET = withX402(handler, {
  accepts: { scheme: 'exact', network: 'eip155:10143', payTo: PAY_TO, price: '$0.001' },
}, x402Server);
```

## 5. 客户端实现（`@x402/fetch`）

```typescript
import { x402Client, wrapFetchWithPayment } from '@x402/fetch';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { toClientEvmSigner } from '@x402/evm';

// 用 toClientEvmSigner 创建 signer（需要 publicClient 提供 readContract）
const signer = toClientEvmSigner(
  { address: account, signTypedData: (msg) => walletClient.signTypedData(msg) },
  { readContract: (args) => publicClient.readContract(args) }
);

const client = new x402Client();
registerExactEvmScheme(client, { signer });
const x402Fetch = wrapFetchWithPayment(fetch, client);

// 自动处理 402 → 签名 → 重试
const response = await x402Fetch('/api/v1/x402-test');
```

## 6. 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `packages/server/src/lib/x402-server.ts` | 重写 | stub → 真正的 x402ResourceServer |
| `packages/server/src/app/api/v1/x402-test/route.ts` | 新建 | withX402 保护的测试端点 |
| `packages/server/src/app/api/v1/grid/purchase/route.ts` | 修改 | x402 方法跳过链上验证 |
| `packages/server/src/app/api/v1/quote/route.ts` | 修改 | 移除旧 getX402 stub |
| `packages/server/src/app/api/v1/swap/route.ts` | 修改 | 移除旧 getX402 stub |
| `packages/frontend/src/app/components/tabs/GridTab.tsx` | 重写 | x402 按钮用真正的 x402 协议 |
| `packages/frontend/src/hooks/useGrid.ts` | 不变 | Grid 数据 hook |
| `packages/frontend/src/app/components/MainLayout.tsx` | 不变 | 已有 Grid tab |

## 7. 踩坑记录

1. **`@x402/next` peer dep 冲突**：要求 `next ^16.0.10`，项目用 `next 14.2.0`。实际 CJS import 可以绕过，运行时没问题。
2. **`ClientEvmSigner` 需要 `readContract`**：不能只传 `address + signTypedData`，必须用 `toClientEvmSigner(signer, publicClient)` 来创建，publicClient 提供 `readContract` 能力。
3. **MoneyParser 注册**：`ExactEvmScheme` 不知道 Monad USDC 地址，必须 `registerMoneyParser` 告诉它 `$0.001` 对应 `1000` (6 decimals)。
4. **Facilitator 负责结算**：服务端不需要自己广播交易，facilitator 会在验证签名后结算到链上。
5. **`getX402()` 旧 API 彻底废弃**：quote 和 swap routes 的旧 x402 validation 代码全部移除，用专门的 `/x402-test` 端点测试。
6. **USDC 地址必须用 Monad 官方的**：`0x534b2f3A21130d7a60830c2Df862319e593943A3`（Circle 在 Monad 上部署的），不是 Uniswap 池里的旧测试 USDC。
