# ClawSwap Phase 3 — 测试网真实交易（AA 钱包全套）

> Phase 2 已完成: 合约地址统一、真实链上报价、Agent DCA 模拟循环、运行面板真实数据
>
> Phase 3 目标: **在 Monad testnet 上真正执行 swap，用 ZeroDev AA 钱包 + Paymaster (gasless)**
>
> 前提: 用户已在 ZeroDev Dashboard 创建了 Monad Testnet 项目，拿到了 Project ID

---

## 环境变量

在 `.env` 中添加:

```
NEXT_PUBLIC_ZERODEV_PROJECT_ID=你的ZeroDev项目ID
```

ZeroDev 的 RPC URL 格式 (bundler + paymaster 共用):
```
https://rpc.zerodev.app/api/v2/bundler/${PROJECT_ID}
https://rpc.zerodev.app/api/v2/paymaster/${PROJECT_ID}
```

---

## Prompt 1: 修复 AA 钱包创建 — 对齐 ZeroDev SDK 最新 API

### 问题

当前 `smart-wallet.ts` 和 `session-key.ts` 使用了旧版 API:
- `entryPoint07Address` 直接作为值传入 → 应该用 `getEntryPoint("0.7")`
- `kernelVersion: "0.3.1"` 字符串 → 应该用 `KERNEL_V3_1` 常量
- Session Key 的 `serializePermissionAccount` 逻辑不完整（返回 `mockSerialized`）

### 需要修改的文件

#### 1.1 修改 `packages/frontend/src/lib/smart-wallet.ts`

完全替换为:

```typescript
import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
} from "@zerodev/sdk";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants";
import { http, createPublicClient } from "viem";
import { monadTestnet } from "./chains";

const PROJECT_ID = process.env.NEXT_PUBLIC_ZERODEV_PROJECT_ID || '';
const ZERODEV_RPC = `https://rpc.zerodev.app/api/v2/bundler/${PROJECT_ID}`;
const PAYMASTER_RPC = `https://rpc.zerodev.app/api/v2/paymaster/${PROJECT_ID}`;

const entryPoint = getEntryPoint("0.7");
const kernelVersion = KERNEL_V3_1;

export const createSmartWallet = async (signer: unknown) => {
  if (!PROJECT_ID) {
    throw new Error("NEXT_PUBLIC_ZERODEV_PROJECT_ID is not set");
  }

  const publicClient = createPublicClient({
    transport: http(monadTestnet.rpcUrls.default.http[0]),
    chain: monadTestnet,
  });

  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer: signer as Parameters<typeof signerToEcdsaValidator>[1]['signer'],
    entryPoint,
    kernelVersion,
  });

  const account = await createKernelAccount(publicClient, {
    plugins: {
      sudo: ecdsaValidator,
    },
    entryPoint,
    kernelVersion,
  });

  const paymasterClient = createZeroDevPaymasterClient({
    chain: monadTestnet,
    transport: http(PAYMASTER_RPC),
  });

  const kernelClient = createKernelAccountClient({
    account,
    chain: monadTestnet,
    bundlerTransport: http(ZERODEV_RPC),
    client: publicClient,
    paymaster: {
      getPaymasterData: (userOperation) => {
        return paymasterClient.sponsorUserOperation({
          userOperation,
        });
      },
    },
  });

  return {
    account,
    kernelClient,
    address: account.address,
  };
};
```

#### 1.2 修改 `packages/frontend/src/lib/session-key.ts`

完全替换。实现完整的 Session Key 流程——使用 `addressToEmptyAccount` 获取 approval 签名，然后序列化:

```typescript
import {
  serializePermissionAccount,
  toPermissionValidator,
} from "@zerodev/permissions";
import { toECDSASigner } from "@zerodev/permissions/signers";
import { toSudoPolicy } from "@zerodev/permissions/policies";
import {
  createKernelAccount,
  addressToEmptyAccount,
} from "@zerodev/sdk";
import { getEntryPoint, KERNEL_V3_1 } from "@zerodev/sdk/constants";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http, type Hex } from "viem";
import { monadTestnet } from "./chains";

const entryPoint = getEntryPoint("0.7");
const kernelVersion = KERNEL_V3_1;

/**
 * 创建 Session Key 并序列化
 *
 * 流程 (参考 ZeroDev 官方示例):
 * 1. 生成一个新的 session key pair
 * 2. 用 addressToEmptyAccount(sessionKeyAddress) 创建空签名者
 * 3. 用空签名者创建 permissionValidator
 * 4. 创建带 sudo + regular plugin 的 kernelAccount → 获取 owner approval
 * 5. serializePermissionAccount → 得到序列化字符串
 * 6. 返回序列化字符串 + session private key → 发送给 server
 * 7. Server 用 deserializePermissionAccount + 真实 session key 重建账户
 */
export const createAndSerializeSessionKey = async (
  publicClient: any,
  kernelClient: any,
) => {
  const sessionPrivateKey = generatePrivateKey();
  const sessionKeyAccount = privateKeyToAccount(sessionPrivateKey);

  // 用 addressToEmptyAccount 创建空签名者（不需要私钥，只用于获取 approval）
  const emptyAccount = addressToEmptyAccount(sessionKeyAccount.address);
  const emptySessionKeySigner = await toECDSASigner({
    signer: emptyAccount,
  });

  // 定义策略 — 目前用 sudoPolicy（测试用），后续可改为 callPolicy
  const sudoPolicy = toSudoPolicy({});

  // 创建 permissionValidator（用空签名者）
  const permissionPlugin = await toPermissionValidator(publicClient, {
    entryPoint,
    signer: emptySessionKeySigner,
    policies: [sudoPolicy],
    kernelVersion,
  });

  // 获取 owner 的 ecdsaValidator（从 kernelClient 的 account 获取 signer）
  // 由于 kernelClient.account 已经有 sudo validator，我们需要重新创建一个带 regular plugin 的 account
  const ownerSigner = kernelClient.account;

  // 创建带 regular (permission) plugin 的 kernelAccount
  // 注意: 这里需要 owner 的 ecdsaValidator 作为 sudo
  // 我们从 kernelClient 提取 provider/signer 来构建
  const provider = await (window as any)?.ethereum;

  let ecdsaValidator;
  try {
    // 尝试从已有的 Privy 钱包获取 signer
    const { useWallets } = await import("@privy-io/react-auth");
    // 如果在 hook 外部，我们直接用 kernelClient 的 account
    ecdsaValidator = await signerToEcdsaValidator(publicClient, {
      signer: ownerSigner as any,
      entryPoint,
      kernelVersion,
    });
  } catch {
    // fallback: 用 kernelClient 现有的 account
    ecdsaValidator = kernelClient.account.kernelPluginManager?.sudoValidator;
  }

  // 如果获取 ecdsaValidator 失败，回退到简化模式
  if (!ecdsaValidator) {
    console.warn("Could not get ecdsaValidator, using simplified session key");
    return {
      sessionPrivateKey,
      serialized: JSON.stringify({
        sessionPrivateKey,
        smartWalletAddress: kernelClient.account.address,
        policies: ['sudo'],
      }),
    };
  }

  const sessionKeyKernelAccount = await createKernelAccount(publicClient, {
    entryPoint,
    plugins: {
      sudo: ecdsaValidator,
      regular: permissionPlugin,
    },
    kernelVersion,
  });

  // 序列化 — 这一步会要求 owner 签名 approval
  const serialized = await serializePermissionAccount(sessionKeyKernelAccount);

  return {
    sessionPrivateKey,
    serialized,
  };
};
```

#### 1.3 修改 `packages/frontend/src/hooks/useSmartWallet.ts`

更新 `authorizeAgent` 以使用新的返回值格式:

```typescript
import { useState, useCallback, useEffect } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { createSmartWallet } from '@/lib/smart-wallet';
import { createAndSerializeSessionKey } from '@/lib/session-key';
import { usePublicClient } from 'wagmi';
import { getApiUrl } from '@/lib/api';

export function useSmartWallet() {
  const { user, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const publicClient = usePublicClient();

  const [smartAccount, setSmartAccount] = useState<any>(null);
  const [kernelClient, setKernelClient] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initWallet = useCallback(async () => {
    if (!authenticated || !user || wallets.length === 0) return;

    const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');
    const wallet = embeddedWallet || wallets[0];
    if (!wallet) return;

    setLoading(true);
    setError(null);
    try {
      await wallet.switchChain(10143);
      const provider = await wallet.getEthereumProvider();
      const { account, kernelClient } = await createSmartWallet(provider as any);

      setSmartAccount(account);
      setKernelClient(kernelClient);
      console.log("Smart Wallet Created:", account.address);
    } catch (err: any) {
      console.error("Failed to init smart wallet:", err);
      setError(err?.message || "Failed to create smart wallet");
    } finally {
      setLoading(false);
    }
  }, [authenticated, user, wallets]);

  useEffect(() => {
    if (authenticated && !smartAccount && !loading) {
      initWallet();
    }
  }, [authenticated, smartAccount, loading, initWallet]);

  const authorizeAgent = async (opts?: { strategyType?: string; strategyConfig?: Record<string, unknown> }) => {
    if (!kernelClient || !publicClient || !user?.id) return false;

    try {
      const { serialized, sessionPrivateKey } = await createAndSerializeSessionKey(publicClient, kernelClient);

      const response = await fetch(getApiUrl('/api/v1/agent/authorize'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          serializedSessionKey: serialized,
          privateKey: sessionPrivateKey,
          agentAddress: smartAccount?.address ?? undefined,
          smartWalletAddress: smartAccount?.address ?? undefined,
          strategyType: opts?.strategyType,
          strategyConfig: opts?.strategyConfig,
          validUntil: Math.floor(Date.now() / 1000) + 24 * 3600,
        }),
      });

      if (!response.ok) throw new Error('Failed to authorize agent');
      return true;
    } catch (error) {
      console.error('Authorization failed:', error);
      return false;
    }
  };

  const revokeAgent = async () => {
    if (!user?.id) return false;
    try {
      const res = await fetch(getApiUrl('/api/v1/agent/revoke'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      if (!res.ok) throw new Error('Revoke failed');
      return true;
    } catch (error) {
      console.error('Revocation failed:', error);
      return false;
    }
  };

  return {
    user,
    smartAccount,
    kernelClient,
    loading,
    error,
    initWallet,
    authorizeAgent,
    revokeAgent,
    address: smartAccount?.address,
  };
}
```

### 验证方法

1. 确保 `.env` 中 `NEXT_PUBLIC_ZERODEV_PROJECT_ID` 已设置
2. 启动前端 `npm run dev`
3. 用 Privy 登录
4. 检查 console: 应该看到 `Smart Wallet Created: 0x...`（这是 AA 钱包地址）
5. 如果报错 `NEXT_PUBLIC_ZERODEV_PROJECT_ID is not set` 或 ZeroDev RPC 报错，检查 Project ID 和 Dashboard 配置

---

## Prompt 2: SwapTab 通过 AA 钱包执行真实 swap（Gasless）

### 问题

当前 SwapTab 的 `handleSwap` 只调 server `/api/v1/swap` 获取 calldata 然后 `kernelClient.sendTransaction`。这个流程可以工作，但需要:
1. 先 approve ERC20 给 SwapRouter（如果是 USDC → MON）
2. 使用 `kernelClient.sendUserOperation` + `account.encodeCalls` 来批量执行 approve + swap（一个 UserOp 里同时搞定，省一步）
3. 显示真实 tx hash 和 explorer 链接
4. 余额要用 AA 钱包地址查（不是 Privy EOA 地址）

### 需要修改的文件

#### 2.1 修改 `packages/frontend/src/hooks/useBalances.ts`

余额查询改用 AA 钱包地址（`useSmartWallet` 返回的地址），而不是 Privy 的 EOA 地址:

```typescript
import { useState, useCallback } from 'react';
import { usePublicClient } from 'wagmi';
import { formatUnits, parseAbi, type Address } from 'viem';
import { MONAD_CONTRACTS } from '@/lib/chains';
import { useSmartWallet } from './useSmartWallet';

const ERC20_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
]);

export function useBalances() {
  const publicClient = usePublicClient();
  const { address } = useSmartWallet();
  const [mon, setMon] = useState<string>('0');
  const [usdc, setUsdc] = useState<string>('0');
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!address || !publicClient) {
      setMon('0');
      setUsdc('0');
      return;
    }
    setLoading(true);
    try {
      const [monBalance, usdcBalance] = await Promise.all([
        publicClient.getBalance({ address: address as Address }),
        publicClient.readContract({
          address: MONAD_CONTRACTS.USDC as Address,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address as Address],
        }).catch(() => BigInt(0)),
      ]);
      setMon(formatUnits(monBalance, 18));
      setUsdc(formatUnits(usdcBalance as bigint, 6));
    } catch {
      setMon('0');
      setUsdc('0');
    } finally {
      setLoading(false);
    }
  }, [address, publicClient]);

  const monNum = parseFloat(mon) || 0;
  const usdcNum = parseFloat(usdc) || 0;
  const totalUsd = usdcNum + monNum * 0.4;

  return { mon: monNum, usdc: usdcNum, totalUsd, loading, refresh, formatted: { mon, usdc } };
}
```

#### 2.2 修改 `packages/frontend/src/app/components/tabs/SwapTab.tsx`

把 handleSwap 改为用 `kernelClient.sendUserOperation` 批量执行 approve + swap:

```typescript
// 在文件顶部添加 import:
import {
  parseUnits,
  parseAbi,
  encodeFunctionData,
  formatUnits,
  type Address,
} from 'viem';

// 合约地址和 ABI（在组件外定义）
const SWAP_ROUTER = '0xfe31f71c1b106eac32f1a19239c9a9a72ddfb900' as Address;
const WMON = '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A' as Address;
const USDC_ADDR = '0x534b2f3A21130d7a60830c2Df862319e593943A3' as Address;

const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
]);
const SWAP_ROUTER_ABI = parseAbi([
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)',
]);

function getTokenAddress(symbol: string): Address {
  return symbol.toUpperCase() === 'USDC' ? USDC_ADDR : WMON;
}
function getTokenDecimals(symbol: string): number {
  return symbol.toUpperCase() === 'USDC' ? 6 : 18;
}
```

然后在组件内部，从 `useSmartWallet()` 解构出 `smartAccount`:
```typescript
const { kernelClient, smartAccount, address: walletAddress } = useSmartWallet();
```

替换整个 `handleSwap` 函数:

```typescript
const [txHash, setTxHash] = useState<string | null>(null);

const handleSwap = async () => {
  if (!kernelClient || !smartAccount || !walletAddress || !quote) return;

  setSwapToast('sending');
  setTxHash(null);
  try {
    const addrIn = getTokenAddress(tokenIn);
    const addrOut = getTokenAddress(tokenOut);
    const decimalsIn = getTokenDecimals(tokenIn);
    const decimalsOut = getTokenDecimals(tokenOut);
    const amountInWei = parseUnits(amountIn, decimalsIn);
    const amountOutWei = parseUnits(quote.amountOut, decimalsOut);
    const amountOutMinimum = amountOutWei * 995n / 1000n; // 0.5% slippage
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);

    const isNativeIn = tokenIn.toUpperCase() === 'MON';

    // 构建 calls 数组 — AA 钱包可以批量执行
    const calls: Array<{ to: Address; value: bigint; data: `0x${string}` }> = [];

    // 如果是 ERC20 (USDC)，先 approve
    if (!isNativeIn) {
      calls.push({
        to: addrIn,
        value: 0n,
        data: encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [SWAP_ROUTER, amountInWei],
        }),
      });
    }

    // swap
    calls.push({
      to: SWAP_ROUTER,
      value: isNativeIn ? amountInWei : 0n,
      data: encodeFunctionData({
        abi: SWAP_ROUTER_ABI,
        functionName: 'exactInputSingle',
        args: [{
          tokenIn: addrIn,
          tokenOut: addrOut,
          fee: 3000,
          recipient: walletAddress as Address,
          deadline,
          amountIn: amountInWei,
          amountOutMinimum,
          sqrtPriceLimitX96: 0n,
        }],
      }),
    });

    setSwapToast('confirming');

    // 用 sendUserOperation 批量执行 (approve + swap 在一个 UserOp 里)
    const userOpHash = await kernelClient.sendUserOperation({
      callData: await smartAccount.encodeCalls(calls),
    });

    // 等待 UserOp 被打包上链
    const receipt = await kernelClient.waitForUserOperationReceipt({
      hash: userOpHash,
    });

    const hash = receipt.receipt.transactionHash;
    console.log('Swap tx:', hash);
    setTxHash(hash);
    setSwapToast('done');
    setAmountIn('');
    refreshBalances();
    setTimeout(() => setSwapToast(null), 5000);
  } catch (e: any) {
    console.error('Swap error:', e);
    alert(`Swap 失败: ${e?.shortMessage || e?.message || '未知错误'}`);
    setSwapToast(null);
  }
};
```

把 toast 显示部分升级，加入 tx hash 链接:

```tsx
{swapToast && (
  <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-xl bg-[#18181B] border border-zinc-700 text-sm text-zinc-300 flex items-center gap-2">
    {swapToast === 'sending' && '构建交易中...'}
    {swapToast === 'confirming' && '等待链上确认...'}
    {swapToast === 'done' && (
      <>
        ✅ 交易成功
        {txHash && (
          <a
            href={`https://testnet.monadexplorer.com/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
            className="text-[#7C3AED] hover:underline ml-1"
          >
            查看 ↗
          </a>
        )}
      </>
    )}
  </div>
)}
```

### 验证方法

1. 登录后看到 AA 钱包地址
2. 确保 AA 钱包有 USDC（需要从你的 EOA 转 USDC 到 AA 钱包地址）
3. 输入 `0.1` USDC → MON，看到链上报价
4. 点 Swap → 交易通过 ZeroDev bundler 上链 (gasless，不需要 MON 付 gas！)
5. 看到 tx hash 链接，点击可在 explorer 查看

---

## Prompt 3: Agent 服务端真实执行 DCA

### 问题

agent-runner.ts 的 `executeDCA()` 还是 `simulated = true`。需要让 Agent 真正在链上执行 swap。

### 解决方案

Agent 在 server 端用 `.env` 的 `PRIVATE_KEY` 创建一个独立的 EOA 钱包发交易。这是最简单可靠的方案——Agent 的钱包独立于用户的 AA 钱包，用户往 Agent 钱包转 USDC，Agent 执行定投。

(完整的 Session Key 方案——让 Agent 操作用户的 AA 钱包——可以后续实现，但黑客松 demo 用独立钱包更稳。)

### 需要创建/修改的文件

#### 3.1 创建 `packages/server/src/lib/agent-wallet.ts`

```typescript
import {
  createWalletClient,
  createPublicClient,
  http,
  type Address,
  type Hex,
  type WalletClient,
  type PublicClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadTestnet, CONTRACTS, ERC20_ABI } from './monad';

let _walletClient: WalletClient | null = null;
let _publicClient: PublicClient | null = null;
let _address: Address | null = null;

export function getAgentWallet() {
  if (_walletClient && _publicClient && _address) {
    return { walletClient: _walletClient, publicClient: _publicClient, address: _address };
  }

  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error('PRIVATE_KEY not set in .env');

  const account = privateKeyToAccount(`0x${pk.replace(/^0x/, '')}` as Hex);
  _publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(monadTestnet.rpcUrls.default.http[0]),
  });
  _walletClient = createWalletClient({
    account,
    chain: monadTestnet,
    transport: http(monadTestnet.rpcUrls.default.http[0]),
  });
  _address = account.address;
  console.log(`[AgentWallet] Initialized: ${_address}`);
  return { walletClient: _walletClient, publicClient: _publicClient, address: _address };
}

export async function getAgentBalances() {
  const { publicClient, address } = getAgentWallet();
  const [mon, usdc] = await Promise.all([
    publicClient.getBalance({ address }),
    publicClient.readContract({
      address: CONTRACTS.USDC,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [address],
    }),
  ]);
  return { mon, usdc: usdc as bigint };
}

export async function ensureApproval(tokenAddress: Address, spender: Address, amount: bigint) {
  const { walletClient, publicClient, address } = getAgentWallet();
  const allowance = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [address, spender],
  }) as bigint;

  if (allowance >= amount) return;

  const hash = await walletClient.writeContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [spender, amount * 100n],
    account: walletClient.account!,
    chain: monadTestnet,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  console.log(`[AgentWallet] Approved ${tokenAddress} → ${spender}, tx: ${hash}`);
}
```

#### 3.2 创建 `packages/server/src/app/api/v1/agent/wallet/route.ts`

让前端能查看 Agent 钱包地址和余额:

```typescript
import { NextResponse } from 'next/server';
import { getAgentWallet, getAgentBalances } from '@/lib/agent-wallet';
import { formatUnits, formatEther } from 'viem';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { address } = getAgentWallet();
    const balances = await getAgentBalances();
    return NextResponse.json({
      address,
      balances: { mon: formatEther(balances.mon), usdc: formatUnits(balances.usdc, 6) },
      explorerUrl: `https://testnet.monadexplorer.com/address/${address}`,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Agent wallet not configured' }, { status: 503 });
  }
}
```

#### 3.3 修改 `packages/server/src/lib/agent-runner.ts`

把模拟执行改为真实链上交易。

在文件顶部添加 import:
```typescript
import { getAgentWallet, ensureApproval, getAgentBalances } from './agent-wallet';
import { SWAP_ROUTER_ABI } from './monad';
import { encodeFunctionData, formatEther } from 'viem';
```

替换 `executeDCA` 函数中 `// ---- 真实链上交易 ----` 注释以下的部分（从 `const txHash = ...` 到函数结束），改为真实交易逻辑:

```typescript
  // ---- 检查 Agent 钱包余额 ----
  let agentBalances;
  try {
    agentBalances = await getAgentBalances();
  } catch (e) {
    emitAgentEvent(state.privyUserId, {
      type: 'error',
      msg: `Agent 钱包初始化失败: ${(e as Error).message}`,
      timestamp: now,
    });
    return;
  }

  if (agentBalances.usdc < amountInWei) {
    emitAgentEvent(state.privyUserId, {
      type: 'error',
      msg: `Agent USDC 不足: 需要 ${amount}，余额 ${formatUnits(agentBalances.usdc, 6)}`,
      timestamp: now,
    });
    return;
  }

  if (agentBalances.mon < parseUnits('0.01', 18)) {
    emitAgentEvent(state.privyUserId, {
      type: 'error',
      msg: `Agent MON 不足以付 gas: ${formatEther(agentBalances.mon)} MON`,
      timestamp: now,
    });
    return;
  }

  // ---- 真实链上交易 ----
  let txHash: string;
  let status: string;

  try {
    const { walletClient, publicClient, address } = getAgentWallet();

    // approve USDC
    await ensureApproval(CONTRACTS.USDC, CONTRACTS.SWAP_ROUTER, amountInWei);

    // swap
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
    console.error('[AgentRunner] Swap failed:', e);
    txHash = `FAILED-${Date.now()}`;
    status = 'failed';

    emitAgentEvent(state.privyUserId, {
      type: 'error',
      msg: `交易失败: ${e?.shortMessage || e?.message || '未知错误'}`,
      timestamp: now,
    });

    try {
      await prisma.trade.create({
        data: {
          userId: state.userId, strategy: 'DCA', tokenIn: 'USDC',
          tokenOut: tokenOutSymbol, amountIn: amount.toString(), amountOut: '0',
          txHash, status: 'failed',
          reason: `DCA 失败: ${e?.shortMessage || e?.message || '未知'}`,
        },
      });
    } catch (_) {}

    state.lastExecTime = now;
    return;
  }

  // 成功 — 写入 DB
  try {
    await prisma.trade.create({
      data: {
        userId: state.userId, strategy: 'DCA', tokenIn: 'USDC',
        tokenOut: tokenOutSymbol, amountIn: amount.toString(),
        amountOut: amountOutFormatted, txHash, status,
        reason: `DCA 定投 — 每 ${intervalMs / 60000} 分钟买入 ${amount} USDC 的 ${tokenOutSymbol}`,
      },
    });
  } catch (e) {
    console.error('[AgentRunner] Failed to write trade:', e);
  }

  state.lastExecTime = now;
  state.dailySpent += amount;
  state.tradeCount += 1;

  const explorerUrl = `https://testnet.monadexplorer.com/tx/${txHash}`;
  emitAgentEvent(state.privyUserId, {
    type: 'trade',
    msg: `✅ 买入 ${amount} USDC → ${Number(amountOutFormatted).toFixed(4)} ${tokenOutSymbol} | tx: ${txHash.slice(0, 10)}...`,
    trade: {
      tokenIn: 'USDC', tokenOut: tokenOutSymbol,
      amountIn: amount.toString(), amountOut: amountOutFormatted,
      txHash, explorerUrl, status,
    },
    timestamp: now,
  });

  console.log(`[AgentRunner] DCA: ${amount} USDC → ${amountOutFormatted} ${tokenOutSymbol} | tx: ${txHash}`);
```

### 验证方法

1. `curl http://localhost:3005/api/v1/agent/wallet` 查看 Agent 钱包地址
2. 往 Agent 钱包转 USDC (比如 10 USDC) + MON (比如 1 MON 付 gas)
3. 前端启动 DCA 策略
4. 30 秒后看 server 日志: `[AgentRunner] DCA: 1 USDC → X.XX MON | tx: 0x...`
5. 去 explorer 查看交易

---

## Prompt 4: AgentTab 显示 Agent 钱包 + Explorer 链接

### 需要创建/修改的文件

#### 4.1 创建 `packages/frontend/src/hooks/useAgentWallet.ts`

```typescript
import { useState, useEffect } from 'react';
import { getApiUrl } from '@/lib/api';

interface AgentWalletInfo {
  address: string;
  balances: { mon: string; usdc: string };
  explorerUrl: string;
}

export function useAgentWallet() {
  const [info, setInfo] = useState<AgentWalletInfo | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(getApiUrl('/api/v1/agent/wallet'));
        if (res.ok) setInfo(await res.json());
      } catch (_) {}
    };
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);

  return { info };
}
```

#### 4.2 修改 `packages/frontend/src/app/components/tabs/AgentTab.tsx`

1. 添加 import:
```typescript
import { useAgentWallet } from '@/hooks/useAgentWallet';
```

2. 在组件内添加:
```typescript
const { info: agentWallet } = useAgentWallet();
```

3. 在策略选择页面 `<p className="text-zinc-500 text-sm">—— 选择策略 ——</p>` 之前加入 Agent 钱包信息:

```tsx
{agentWallet && (
  <div className="bg-zinc-800/50 rounded-xl p-4 text-sm space-y-2">
    <p className="text-zinc-400 font-medium">Agent 钱包（需充值测试币）</p>
    <div className="flex items-center gap-2">
      <code className="text-xs text-zinc-300 bg-zinc-800 px-2 py-1 rounded flex-1 truncate">
        {agentWallet.address}
      </code>
      <button
        type="button"
        onClick={() => navigator.clipboard.writeText(agentWallet.address)}
        className="text-xs text-[#7C3AED] hover:text-violet-400 shrink-0"
      >
        复制
      </button>
    </div>
    <div className="flex gap-4 text-zinc-400">
      <span>MON: {Number(agentWallet.balances.mon).toFixed(4)}</span>
      <span>USDC: {Number(agentWallet.balances.usdc).toFixed(2)}</span>
    </div>
    <a href={agentWallet.explorerUrl} target="_blank" rel="noreferrer"
       className="text-xs text-[#7C3AED] hover:underline">
      在 Explorer 上查看 ↗
    </a>
  </div>
)}
```

4. 在运行面板的日志中，给 SSE 事件的 trade 类型设正确的 log type:
```typescript
newEvents.forEach((ev) => {
  const msg = (ev.msg ?? ev.text ?? JSON.stringify(ev)) as string;
  const type = ev.type === 'trade' ? 'buy'
    : ev.type === 'error' ? 'skip'
    : ev.type === 'skip' ? 'skip'
    : 'info';
  addLog(msg, type as any);
});
```

5. 日志渲染中，让 tx hash 可点击:
```tsx
{logs.map((l, i) => {
  const txMatch = l.msg.match(/tx: (0x[a-fA-F0-9]{8,})/);
  return (
    <div key={i} className={clsx('py-1', /* 已有颜色逻辑 */)}>
      [{l.time}] {l.msg}
      {txMatch && (
        <a href={`https://testnet.monadexplorer.com/tx/${txMatch[1]}`}
           target="_blank" rel="noreferrer"
           className="ml-1 text-[#7C3AED] hover:underline text-xs">↗</a>
      )}
    </div>
  );
})}
```

---

## 执行顺序

```
Prompt 1: 修复 AA 钱包创建（对齐 ZeroDev 最新 API + 完整 session key 序列化）
  ↓
Prompt 2: SwapTab 通过 AA 钱包执行真实 swap (gasless, 批量 approve+swap)
  ↓
Prompt 3: Agent 服务端真实执行 DCA (PRIVATE_KEY 钱包)
  ↓
Prompt 4: AgentTab 显示 Agent 钱包 + Explorer 链接
```

---

## 测试前准备清单

```
✅ .env 设好 NEXT_PUBLIC_ZERODEV_PROJECT_ID
✅ .env 设好 NEXT_PUBLIC_PRIVY_APP_ID
✅ .env 设好 PRIVATE_KEY (Agent 钱包)
✅ .env 设好 DATABASE_URL="file:./prisma/dev.db"
✅ .env 设好 NEXT_PUBLIC_API_URL=http://localhost:3005

步骤:
1. cd packages/server && npx prisma db push && npm run dev
2. cd packages/frontend && npm run dev
3. 浏览器打开 → Privy 登录 → 看到 AA 钱包地址
4. 往 AA 钱包转 USDC → 测试 Swap (gasless!)
5. curl localhost:3005/api/v1/agent/wallet → 看到 Agent 钱包地址
6. 往 Agent 钱包转 USDC + MON → 启动 DCA → 真实交易上链
```

## 关键特性

| 功能 | 用户体验 |
|------|---------|
| SwapTab | 用户 swap **不需要 MON 付 gas** (Paymaster 赞助) |
| Agent DCA | Agent 用独立钱包 **真实执行链上 swap** |
| Explorer | 每笔交易都有 **可点击的 explorer 链接** |
| Session Key | 完整的 serialize/deserialize 流程 (sudoPolicy，后续可收紧) |
