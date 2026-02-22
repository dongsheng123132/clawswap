# 技术规范：逐步实现指南

> 这份文档是给 Cursor（AI 编程工具）用的实现指南。按顺序执行每个步骤即可。

---

## Phase 1: 项目初始化

### Step 1.1: 创建 Monorepo

```bash
mkdir openclaw && cd openclaw
pnpm init
```

**根 `package.json`:**
```json
{
  "name": "openclaw",
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "test": "turbo test"
  },
  "devDependencies": {
    "turbo": "^2.3.0",
    "typescript": "^5.7.0"
  }
}
```

**`turbo.json`:**
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "dev": { "cache": false, "persistent": true },
    "test": { "dependsOn": ["build"] }
  }
}
```

**`pnpm-workspace.yaml`:**
```yaml
packages:
  - "packages/*"
```

### Step 1.2: 创建子包

```bash
mkdir -p packages/{contracts,agent,server,frontend,sdk}
```

---

## Phase 2: 智能合约 (packages/contracts)

### Step 2.1: 初始化 Foundry 项目

```bash
cd packages/contracts
forge init --no-git
```

### Step 2.2: Fork Uniswap V3 核心合约

从 Uniswap V3 fork 以下合约，做最小修改：

**需要 fork 的合约清单：**

| 合约 | 来源 | 修改点 |
|------|------|--------|
| UniswapV3Factory.sol | @uniswap/v3-core | 重命名为 OpenClawFactory，修改 fee tier |
| UniswapV3Pool.sol | @uniswap/v3-core | 重命名为 OpenClawPool |
| SwapRouter.sol | @uniswap/v3-periphery | 适配新 Factory 地址 |
| Quoter.sol | @uniswap/v3-periphery | 用于链下报价 |
| NonfungiblePositionManager.sol | @uniswap/v3-periphery | LP NFT 管理 |

**安装依赖：**
```bash
forge install Uniswap/v3-core --no-git
forge install Uniswap/v3-periphery --no-git
forge install OpenZeppelin/openzeppelin-contracts --no-git
```

**`foundry.toml`:**
```toml
[profile.default]
src = "src"
out = "out"
libs = ["lib"]
solc_version = "0.7.6"
evm_version = "paris"
optimizer = true
optimizer_runs = 200

[rpc_endpoints]
monad_testnet = "${MONAD_RPC_URL}"

[etherscan]
monad_testnet = { key = "${MONAD_EXPLORER_KEY}", url = "https://testnet.monadexplorer.com/api" }
```

### Step 2.3: 部署脚本

```solidity
// script/Deploy.s.sol
pragma solidity ^0.7.6;
pragma abicoder v2;

import "forge-std/Script.sol";
import "../src/core/OpenClawFactory.sol";
import "../src/periphery/SwapRouter.sol";
import "../src/periphery/NonfungiblePositionManager.sol";
import "../src/periphery/Quoter.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address wmon = vm.envAddress("WMON_ADDRESS"); // Wrapped MON

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy Factory
        OpenClawFactory factory = new OpenClawFactory();

        // 2. Deploy Router
        SwapRouter router = new SwapRouter(address(factory), wmon);

        // 3. Deploy Position Manager
        NonfungiblePositionManager posManager = new NonfungiblePositionManager(
            address(factory),
            wmon,
            address(0) // token descriptor (可选)
        );

        // 4. Deploy Quoter
        Quoter quoter = new Quoter(address(factory), wmon);

        vm.stopBroadcast();

        // 输出部署地址
        console.log("Factory:", address(factory));
        console.log("Router:", address(router));
        console.log("PositionManager:", address(posManager));
        console.log("Quoter:", address(quoter));
    }
}
```

**部署命令：**
```bash
forge script script/Deploy.s.sol \
  --rpc-url monad_testnet \
  --broadcast \
  --verify
```

### Step 2.4: 合约测试

```solidity
// test/OpenClawSwap.t.sol
pragma solidity ^0.7.6;

import "forge-std/Test.sol";
import "../src/core/OpenClawFactory.sol";

contract OpenClawSwapTest is Test {
    OpenClawFactory factory;

    function setUp() public {
        factory = new OpenClawFactory();
    }

    function testCreatePool() public {
        // 创建 USDC/MON 池
        address pool = factory.createPool(
            address(0x1), // token0 (USDC)
            address(0x2), // token1 (WMON)
            3000           // 0.3% fee
        );
        assertTrue(pool != address(0));
    }
}
```

---

## Phase 3: Agent 核心 (packages/agent)

### Step 3.1: 初始化

```bash
cd packages/agent
pnpm init
pnpm add viem @x402/core @x402/evm @x402/fetch dotenv
pnpm add @zerodev/sdk @zerodev/ecdsa-validator @zerodev/permissions permissionless
pnpm add -D typescript @types/node tsx vitest
```

**`tsconfig.json`:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src"]
}
```

### Step 3.2: AA 智能钱包 — 前端创建（Privy + ZeroDev）

> 钱包创建发生在**前端**（用户登录时），不是 Agent 服务端。
> Agent 只接收前端传来的 Session Key。

```typescript
// packages/frontend/src/lib/smart-wallet.ts
// 前端：用户登录后创建 AA 钱包

import { createPublicClient, http } from "viem";
import { createKernelAccount, createKernelAccountClient } from "@zerodev/sdk";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { ENTRYPOINT_ADDRESS_V07 } from "permissionless";
import { monadTestnet } from "./chains";

const ZERODEV_BUNDLER_URL = process.env.NEXT_PUBLIC_ZERODEV_BUNDLER_URL!;
const ZERODEV_PAYMASTER_URL = process.env.NEXT_PUBLIC_ZERODEV_PAYMASTER_URL!;

// 用户用 Twitter/Email 通过 Privy 登录后调用此函数
export async function createSmartWallet(privyEoaProvider: any) {
  const publicClient = createPublicClient({
    chain: monadTestnet,
    transport: http(),
  });

  // 1. 用 Privy EOA 作为 signer 创建 ECDSA Validator
  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer: privyEoaProvider,
    entryPoint: ENTRYPOINT_ADDRESS_V07,
  });

  // 2. 创建 Kernel 智能账户（懒部署：首次交易才上链）
  const account = await createKernelAccount(publicClient, {
    plugins: { sudo: ecdsaValidator },
    entryPoint: ENTRYPOINT_ADDRESS_V07,
  });

  // 3. 创建 Kernel Client（带 Bundler + Paymaster）
  const kernelClient = createKernelAccountClient({
    account,
    chain: monadTestnet,
    entryPoint: ENTRYPOINT_ADDRESS_V07,
    bundlerTransport: http(ZERODEV_BUNDLER_URL),
    middleware: {
      sponsorUserOperation: async ({ userOperation }) => {
        // Paymaster 代付 gas，用户不需要 MON
        // 接入 ZeroDev/Pimlico paymaster
        return userOperation;
      },
    },
  });

  return {
    smartAccountAddress: account.address,
    kernelClient,
    account,
  };
}
```

### Step 3.2b: Session Key 签发（前端 → Agent）

```typescript
// packages/frontend/src/lib/session-key.ts
// 前端：用户授权 Agent 使用 Session Key

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createKernelAccount } from "@zerodev/sdk";
import { toPermissionValidator } from "@zerodev/permissions";
import { toCallPolicy, toRateLimitPolicy } from "@zerodev/permissions/policies";
import { toECDSASigner } from "@zerodev/permissions/signers";
import { serializePermissionAccount } from "@zerodev/permissions";
import { ENTRYPOINT_ADDRESS_V07 } from "permissionless";
import { MONAD_CONTRACTS } from "./chains";

// DEX Router 的 swap 函数 selector
const SWAP_EXACT_INPUT = "0x414bf389"; // exactInputSingle selector
const APPROVE_SELECTOR = "0x095ea7b3"; // ERC-20 approve selector

export interface SessionKeyConfig {
  maxPerTransaction: bigint;  // 单笔上限（USDC, 6 decimals）
  maxPerDay: bigint;          // 日上限
  validForHours: number;      // 有效小时数
  maxCallsPerHour: number;    // 每小时最大调用次数
}

const DEFAULT_CONFIG: SessionKeyConfig = {
  maxPerTransaction: 100_000_000n,  // 100 USDC
  maxPerDay: 1_000_000_000n,        // 1,000 USDC
  validForHours: 24,
  maxCallsPerHour: 10,
};

export async function createAgentSessionKey(
  publicClient: any,
  ownerAccount: any,  // 用户的 Kernel Account
  config: SessionKeyConfig = DEFAULT_CONFIG
): Promise<{
  serializedSessionKey: string;
  agentAddress: `0x${string}`;
}> {
  // 1. 生成 Agent 专用的临时密钥对
  const agentPrivateKey = generatePrivateKey();
  const agentSigner = toECDSASigner({
    signer: privateKeyToAccount(agentPrivateKey),
  });

  // 2. 定义权限策略（Policy）
  const callPolicy = toCallPolicy({
    permissions: [
      // 允许调用 OpenClaw SwapRouter.exactInputSingle
      {
        target: MONAD_CONTRACTS.OPENCLAW_ROUTER,
        functionName: "exactInputSingle",
        // args 可以进一步限制参数范围
      },
      // 允许 USDC approve 给 Router
      {
        target: MONAD_CONTRACTS.USDC,
        functionName: "approve",
        args: [
          { condition: "EQUAL", value: MONAD_CONTRACTS.OPENCLAW_ROUTER },
          null, // amount 不限制（由金额策略控制）
        ],
      },
      // 如需聚合其他 DEX，在这里添加白名单
      // {
      //   target: KURU_ROUTER_ADDRESS,
      //   functionName: "swap",
      // },
    ],
  });

  const rateLimitPolicy = toRateLimitPolicy({
    interval: 3600, // 1 小时
    count: config.maxCallsPerHour,
  });

  // 3. 创建权限 Validator
  const permissionValidator = await toPermissionValidator(publicClient, {
    entryPoint: ENTRYPOINT_ADDRESS_V07,
    signer: agentSigner,
    policies: [callPolicy, rateLimitPolicy],
    validUntil: Math.floor(Date.now() / 1000) + config.validForHours * 3600,
  });

  // 4. 创建受限的 Kernel Account
  const sessionKeyAccount = await createKernelAccount(publicClient, {
    plugins: {
      sudo: ownerAccount.plugins.sudo,      // Owner 保留完全控制
      regular: permissionValidator,           // Agent 使用受限权限
    },
    entryPoint: ENTRYPOINT_ADDRESS_V07,
  });

  // 5. 序列化 → 传给 Agent 服务器
  const serialized = await serializePermissionAccount(
    sessionKeyAccount,
    agentPrivateKey
  );

  return {
    serializedSessionKey: serialized,
    agentAddress: privateKeyToAccount(agentPrivateKey).address,
  };
}
```

### Step 3.2c: Agent 使用 Session Key 交易

```typescript
// packages/agent/src/wallet/agent-wallet.ts
// Agent 服务端：使用 Session Key 发送交易

import { createPublicClient, http } from "viem";
import { createKernelAccountClient } from "@zerodev/sdk";
import { deserializePermissionAccount } from "@zerodev/permissions";
import { ENTRYPOINT_ADDRESS_V07 } from "permissionless";
import { monadTestnet } from "./chains";

const ZERODEV_BUNDLER_URL = process.env.ZERODEV_BUNDLER_URL!;

export class AgentWallet {
  private kernelClient: any;
  private smartAccountAddress: `0x${string}` | null = null;

  // 从前端传来的序列化 Session Key 初始化
  async initFromSessionKey(serializedSessionKey: string) {
    const publicClient = createPublicClient({
      chain: monadTestnet,
      transport: http(),
    });

    // 反序列化 Session Key → 恢复受限的 Kernel Account
    const sessionKeyAccount = await deserializePermissionAccount(
      publicClient,
      ENTRYPOINT_ADDRESS_V07,
      serializedSessionKey
    );

    this.smartAccountAddress = sessionKeyAccount.address;

    // 创建受限的 Kernel Client
    this.kernelClient = createKernelAccountClient({
      account: sessionKeyAccount,
      chain: monadTestnet,
      entryPoint: ENTRYPOINT_ADDRESS_V07,
      bundlerTransport: http(ZERODEV_BUNDLER_URL),
    });
  }

  get address(): `0x${string}` {
    if (!this.smartAccountAddress) throw new Error("Wallet not initialized");
    return this.smartAccountAddress;
  }

  // Agent 发送交易（受 Session Key Policy 限制）
  async sendTransaction(tx: {
    to: `0x${string}`;
    data: `0x${string}`;
    value: bigint;
  }): Promise<`0x${string}`> {
    if (!this.kernelClient) throw new Error("Wallet not initialized");

    // 如果超出 Policy 限制（白名单/金额/频率），链上合约会自动 revert
    const txHash = await this.kernelClient.sendTransaction({
      to: tx.to,
      data: tx.data,
      value: tx.value,
    });

    return txHash;
  }

  // 批量交易（approve + swap 一次完成，省 gas）
  async sendBatchTransaction(txs: Array<{
    to: `0x${string}`;
    data: `0x${string}`;
    value: bigint;
  }>): Promise<`0x${string}`> {
    if (!this.kernelClient) throw new Error("Wallet not initialized");

    const txHash = await this.kernelClient.sendUserOperation({
      callData: await this.kernelClient.account.encodeCalls(
        txs.map((tx) => ({
          to: tx.to,
          data: tx.data,
          value: tx.value,
        }))
      ),
    });

    return txHash;
  }

  // 查询余额（不需要 Session Key，任何人都能查）
  async getBalance(): Promise<{ mon: bigint; usdc: bigint }> {
    const publicClient = createPublicClient({
      chain: monadTestnet,
      transport: http(),
    });

    const [mon, usdc] = await Promise.all([
      publicClient.getBalance({ address: this.address }),
      publicClient.readContract({
        address: "0x534b2f3A21130d7a60830c2Df862319e593943A3",
        abi: [{ name: "balanceOf", type: "function", stateMutability: "view",
                inputs: [{ name: "account", type: "address" }],
                outputs: [{ name: "", type: "uint256" }] }],
        functionName: "balanceOf",
        args: [this.address],
      }) as Promise<bigint>,
    ]);

    return { mon, usdc };
  }
}
```

### Step 3.2d: 前端 Privy 登录集成

```typescript
// packages/frontend/src/app/providers.tsx

"use client";
import { PrivyProvider } from "@privy-io/react-auth";
import { monadTestnet } from "../lib/chains";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#7C3AED", // 紫色主题
        },
        loginMethods: ["twitter", "email", "google"],
        embeddedWallets: {
          createOnLogin: "users-without-wallets",
        },
        // Monad Testnet 配置
        defaultChain: monadTestnet,
        supportedChains: [monadTestnet],
      }}
    >
      {children}
    </PrivyProvider>
  );
}
```

```typescript
// packages/frontend/src/hooks/useSmartWallet.ts

import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useCallback, useState } from "react";
import { createSmartWallet } from "../lib/smart-wallet";
import { createAgentSessionKey } from "../lib/session-key";

export function useSmartWallet() {
  const { login, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const [smartWallet, setSmartWallet] = useState<any>(null);

  // 1. 用户登录后自动创建 AA 钱包
  const initWallet = useCallback(async () => {
    const embeddedWallet = wallets.find(
      (w) => w.walletClientType === "privy"
    );
    if (!embeddedWallet) return;

    const provider = await embeddedWallet.getEthereumProvider();
    const wallet = await createSmartWallet(provider);
    setSmartWallet(wallet);
    return wallet;
  }, [wallets]);

  // 2. 授权 Agent（签发 Session Key）
  const authorizeAgent = useCallback(async () => {
    if (!smartWallet) throw new Error("Wallet not ready");

    const { serializedSessionKey, agentAddress } =
      await createAgentSessionKey(
        smartWallet.publicClient,
        smartWallet.account
      );

    // 将 serializedSessionKey 发送到 Agent 服务器
    await fetch("/api/v1/agent/authorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serializedSessionKey }),
    });

    return agentAddress;
  }, [smartWallet]);

  // 3. 撤销 Agent 权限
  const revokeAgent = useCallback(async () => {
    await fetch("/api/v1/agent/revoke", { method: "POST" });
  }, []);

  return {
    login,
    authenticated,
    user,
    smartWallet,
    initWallet,
    authorizeAgent,
    revokeAgent,
  };
}
```

### Step 3.3: Monad 链定义

```typescript
// packages/agent/src/wallet/chains.ts

import { defineChain } from "viem";

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testnet-rpc.monad.xyz"] },
  },
  blockExplorers: {
    default: {
      name: "Monad Explorer",
      url: "https://testnet.monadexplorer.com",
    },
  },
  testnet: true,
});

export const MONAD_CONTRACTS = {
  USDC: "0x534b2f3A21130d7a60830c2Df862319e593943A3" as const,
  WMON: "0x..." as const, // 部署后填入
  // 自建 DEX 合约地址（部署后填入）
  OPENCLAW_FACTORY: "0x..." as const,
  OPENCLAW_ROUTER: "0x..." as const,
  OPENCLAW_QUOTER: "0x..." as const,
  OPENCLAW_POSITION_MANAGER: "0x..." as const,
};
```

### Step 3.4: DEX Aggregator 实现

```typescript
// packages/agent/src/dex/aggregator.ts

import { type PublicClient } from "viem";

export interface Quote {
  dex: string;
  amountOut: bigint;
  priceImpact: number;
  route: string[];
  estimatedGas: bigint;
}

export interface SwapParams {
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountIn: bigint;
  slippage: number;
  recipient: `0x${string}`;
  deadline?: number;
}

export interface DEXAdapter {
  name: string;
  getQuote(tokenIn: string, tokenOut: string, amountIn: bigint): Promise<Quote>;
  buildSwapTx(params: SwapParams): Promise<{
    to: `0x${string}`;
    data: `0x${string}`;
    value: bigint;
  }>;
}

export class DEXAggregator {
  private adapters: DEXAdapter[] = [];

  registerDEX(adapter: DEXAdapter) {
    this.adapters.push(adapter);
  }

  async getBestQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint
  ): Promise<{ quote: Quote; adapter: DEXAdapter }> {
    const quotes = await Promise.allSettled(
      this.adapters.map(async (adapter) => ({
        quote: await adapter.getQuote(tokenIn, tokenOut, amountIn),
        adapter,
      }))
    );

    const successful = quotes
      .filter((r) => r.status === "fulfilled")
      .map((r) => (r as PromiseFulfilledResult<any>).value);

    if (successful.length === 0) {
      throw new Error("No DEX returned a valid quote");
    }

    // 选净收益最高的（amountOut - gasCost）
    return successful.reduce((best, current) =>
      current.quote.amountOut > best.quote.amountOut ? current : best
    );
  }

  async executeSwap(params: SwapParams): Promise<string> {
    const { adapter } = await this.getBestQuote(
      params.tokenIn,
      params.tokenOut,
      params.amountIn
    );

    const tx = await adapter.buildSwapTx(params);
    // 通过 walletClient 发送交易
    // 返回 tx hash
    return "0x...";
  }
}
```

### Step 3.5: OpenClaw AMM Adapter

```typescript
// packages/agent/src/dex/openclaw-pool.ts

import { encodeFunctionData, parseAbi } from "viem";
import { MONAD_CONTRACTS } from "../wallet/chains";
import type { DEXAdapter, Quote, SwapParams } from "./aggregator";

const SWAP_ROUTER_ABI = parseAbi([
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",
]);

const QUOTER_ABI = parseAbi([
  "function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)",
]);

export class OpenClawAdapter implements DEXAdapter {
  name = "OpenClaw AMM";

  constructor(private publicClient: any) {}

  async getQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint
  ): Promise<Quote> {
    const amountOut = await this.publicClient.readContract({
      address: MONAD_CONTRACTS.OPENCLAW_QUOTER,
      abi: QUOTER_ABI,
      functionName: "quoteExactInputSingle",
      args: [tokenIn, tokenOut, 3000, amountIn, 0n],
    });

    return {
      dex: this.name,
      amountOut,
      priceImpact: 0, // 计算价格影响
      route: [tokenIn, tokenOut],
      estimatedGas: 200_000n,
    };
  }

  async buildSwapTx(params: SwapParams) {
    const deadline = params.deadline ?? Math.floor(Date.now() / 1000) + 1800;
    const amountOutMinimum =
      (params.amountIn * BigInt(Math.floor((1 - params.slippage) * 10000))) /
      10000n;

    const data = encodeFunctionData({
      abi: SWAP_ROUTER_ABI,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn: params.tokenIn,
          tokenOut: params.tokenOut,
          fee: 3000,
          recipient: params.recipient,
          deadline: BigInt(deadline),
          amountIn: params.amountIn,
          amountOutMinimum,
          sqrtPriceLimitX96: 0n,
        },
      ],
    });

    return {
      to: MONAD_CONTRACTS.OPENCLAW_ROUTER,
      data,
      value: 0n,
    };
  }
}
```

### Step 3.6: Agent Core 实现

```typescript
// packages/agent/src/core/agent.ts

import { WalletManager } from "../wallet/wallet-manager";
import { DEXAggregator } from "../dex/aggregator";
import { createX402Fetch } from "../x402/client";
import type { BaseStrategy } from "../strategies/base-strategy";

export interface AgentConfig {
  mode: "autonomous" | "assisted";
  masterKey: string;
  limits: {
    maxTradeSize: number;
    dailyLimit: number;
    maxSlippage: number;
  };
  strategies: BaseStrategy[];
}

export class OpenClawAgent {
  private wallet: WalletManager;
  private aggregator: DEXAggregator;
  private strategies: BaseStrategy[];
  private dailySpent = 0;
  private running = false;

  constructor(private config: AgentConfig) {
    this.wallet = new WalletManager(config.masterKey);
    this.aggregator = new DEXAggregator();
    this.strategies = config.strategies;
  }

  // 启动 Agent
  async start() {
    this.running = true;
    console.log("[Agent] Starting OpenClaw Agent...");

    // 创建或加载钱包
    const walletInfo = await this.wallet.createWallet();
    console.log(`[Agent] Wallet: ${walletInfo.address}`);

    if (this.config.mode === "autonomous") {
      await this.runAutonomousLoop();
    }
  }

  // 自主交易循环
  private async runAutonomousLoop() {
    while (this.running) {
      for (const strategy of this.strategies) {
        const signal = await strategy.evaluate();
        if (signal) {
          await this.executeWithRiskCheck(signal);
        }
      }
      // 等待下一个检查周期
      await new Promise((r) => setTimeout(r, 10_000));
    }
  }

  // 处理用户自然语言指令
  async handleUserInstruction(instruction: string): Promise<string> {
    const intent = await this.parseIntent(instruction);

    switch (intent.action) {
      case "swap":
        return this.handleSwap(intent);
      case "balance":
        return this.handleBalance();
      case "history":
        return this.handleHistory();
      default:
        return `我不理解这个指令: "${instruction}"`;
    }
  }

  private async parseIntent(instruction: string) {
    // 用 LLM 或规则引擎解析意图
    // 返回结构化的 intent 对象
    // { action: "swap", tokenIn: "USDC", tokenOut: "MON", amount: 100 }
    return { action: "swap" as const, tokenIn: "USDC", tokenOut: "MON", amount: 100 };
  }

  // 风控检查
  private async executeWithRiskCheck(signal: any) {
    if (signal.amount > this.config.limits.maxTradeSize) {
      console.log("[Risk] Trade exceeds max size, skipping");
      return;
    }
    if (this.dailySpent + signal.amount > this.config.limits.dailyLimit) {
      console.log("[Risk] Daily limit reached, skipping");
      return;
    }
    // 执行交易...
  }

  stop() {
    this.running = false;
  }
}
```

### Step 3.7: 策略引擎 — 定投 (DCA)

```typescript
// packages/agent/src/strategies/dca.ts

import { BaseStrategy, type TradeSignal } from "./base-strategy";

export interface DCAConfig {
  tokenIn: string;
  tokenOut: string;
  amountPerInterval: number; // 每次买入金额(USDC)
  intervalMs: number;        // 间隔时间(毫秒)
}

export class DCAStrategy extends BaseStrategy {
  private lastExecution = 0;

  constructor(private dcaConfig: DCAConfig) {
    super("DCA");
  }

  async evaluate(): Promise<TradeSignal | null> {
    const now = Date.now();
    if (now - this.lastExecution < this.dcaConfig.intervalMs) {
      return null;
    }

    this.lastExecution = now;
    return {
      action: "swap",
      tokenIn: this.dcaConfig.tokenIn,
      tokenOut: this.dcaConfig.tokenOut,
      amount: this.dcaConfig.amountPerInterval,
      reason: `DCA: 定时买入 ${this.dcaConfig.amountPerInterval} USDC 的 ${this.dcaConfig.tokenOut}`,
    };
  }
}
```

---

## Phase 4: x402 API 服务 (packages/server)

### Step 4.1: 初始化 Next.js

```bash
cd packages/server
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir
pnpm add @x402/core @x402/evm @x402/next viem
```

### Step 4.2: x402 服务端配置

```typescript
// packages/server/src/lib/x402-server.ts

import { x402ResourceServer, HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import type { Network } from "@x402/core/types";

const MONAD_NETWORK: Network = "eip155:10143";
const MONAD_USDC = "0x534b2f3A21130d7a60830c2Df862319e593943A3";
const FACILITATOR_URL = "https://x402-facilitator.molandak.org";

const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
export const x402Server = new x402ResourceServer(facilitatorClient);

const monadScheme = new ExactEvmScheme();
monadScheme.registerMoneyParser(async (amount: number, network: string) => {
  if (network === MONAD_NETWORK) {
    return {
      amount: Math.floor(amount * 1_000_000).toString(),
      asset: MONAD_USDC,
      extra: { name: "USDC", version: "2" },
    };
  }
  return null;
});

x402Server.register(MONAD_NETWORK, monadScheme);

export { MONAD_NETWORK };
```

### Step 4.3: 付费 API 端点 — Quote

```typescript
// packages/server/src/app/api/v1/quote/route.ts

import { NextRequest, NextResponse } from "next/server";
import { withX402, type RouteConfig } from "@x402/next";
import { x402Server, MONAD_NETWORK } from "@/lib/x402-server";

const routeConfig: RouteConfig = {
  accepts: {
    scheme: "exact",
    network: MONAD_NETWORK,
    payTo: process.env.PAY_TO_ADDRESS!,
    price: "$0.0001",
  },
  resource: "/api/v1/quote",
};

async function handler(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenIn = searchParams.get("tokenIn");
  const tokenOut = searchParams.get("tokenOut");
  const amountIn = searchParams.get("amountIn");

  // 调用 aggregator 获取最优报价
  // ...

  return NextResponse.json({
    tokenIn,
    tokenOut,
    amountIn,
    amountOut: "250000000", // 示例
    route: ["USDC", "MON"],
    dex: "OpenClaw AMM",
    priceImpact: "0.05%",
    estimatedGas: "200000",
  });
}

export const GET = withX402(handler, routeConfig, x402Server);
```

### Step 4.4: 付费 API 端点 — Swap

```typescript
// packages/server/src/app/api/v1/swap/route.ts

import { NextRequest, NextResponse } from "next/server";
import { withX402, type RouteConfig } from "@x402/next";
import { x402Server, MONAD_NETWORK } from "@/lib/x402-server";

const routeConfig: RouteConfig = {
  accepts: {
    scheme: "exact",
    network: MONAD_NETWORK,
    payTo: process.env.PAY_TO_ADDRESS!,
    price: "$0.001",
  },
  resource: "/api/v1/swap",
};

async function handler(request: NextRequest) {
  const body = await request.json();
  const { tokenIn, tokenOut, amountIn, walletAddress, slippage } = body;

  // 验证参数
  if (!tokenIn || !tokenOut || !amountIn || !walletAddress) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  // 执行 swap（这里是代理执行模式，Agent 提交签名后的交易）
  // 或返回 calldata 让客户端自己发交易
  const txData = {
    to: "0x...", // Router address
    data: "0x...", // Encoded swap calldata
    value: "0",
    chainId: 10143,
  };

  return NextResponse.json({
    success: true,
    txData,
    message: "Use this calldata to execute the swap on Monad",
  });
}

export const POST = withX402(handler, routeConfig, x402Server);
```

### Step 4.5: 免费端点 — 价格

```typescript
// packages/server/src/app/api/v1/price/route.ts

import { NextRequest, NextResponse } from "next/server";

// 价格接口免费提供，用于 Agent 快速查询
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const token = searchParams.get("token") || "MON";

  // 从链上 Pool 获取实时价格
  // ...

  return NextResponse.json({
    token,
    priceUSD: "0.40",
    priceETH: "0.00015",
    timestamp: Date.now(),
    source: "OpenClaw AMM",
  });
}
```

---

## Phase 5: 前端 (packages/frontend)

### Step 5.1: 初始化

```bash
cd packages/frontend
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir
pnpm add wagmi viem @tanstack/react-query @rainbow-me/rainbowkit
pnpm add @radix-ui/react-dialog @radix-ui/react-select
```

### Step 5.2: Wagmi 配置

```typescript
// packages/frontend/src/lib/wagmi-config.ts

import { createConfig, http } from "wagmi";
import { defineChain } from "viem";

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://testnet-rpc.monad.xyz"] },
  },
  blockExplorers: {
    default: { name: "Monad Explorer", url: "https://testnet.monadexplorer.com" },
  },
  testnet: true,
});

export const config = createConfig({
  chains: [monadTestnet],
  transports: {
    [monadTestnet.id]: http(),
  },
});
```

### Step 5.3: Swap 页面

```typescript
// packages/frontend/src/app/swap/page.tsx
// 实现 Uniswap 风格的 swap 界面
// - 代币选择器（支持搜索）
// - 输入金额 → 实时显示输出金额（调用 Quoter）
// - 显示价格影响、手续费、最小收到
// - "Swap" 按钮 → approve + swap 两步交易
// - 交易状态（pending → confirmed）
```

### Step 5.4: Agent 控制面板

```typescript
// packages/frontend/src/app/agent/page.tsx
// Agent Dashboard 界面
// - 钱包状态（地址、余额）
// - 运行中的策略列表
// - 交易历史（每笔交易的 token、数量、价格、PnL）
// - 自然语言输入框（用户可以发指令给 Agent）
// - 启动/停止 Agent 按钮
```

---

## Phase 6: SDK (packages/sdk)

### Step 6.1: 对外 SDK

```typescript
// packages/sdk/src/client.ts

import { wrapFetchWithPayment } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { x402Client } from "@x402/core/client";

export interface OpenClawConfig {
  apiUrl: string;           // OpenClaw API URL
  walletPrivateKey?: string; // 可选：自动 x402 付费
}

export class OpenClawSDK {
  private fetch: typeof globalThis.fetch;

  constructor(private config: OpenClawConfig) {
    if (config.walletPrivateKey) {
      // 如果提供了私钥，启用 x402 自动付费
      const signer = privateKeyToSigner(config.walletPrivateKey);
      const scheme = new ExactEvmScheme(signer);
      const client = new x402Client().register("eip155:10143", scheme);
      this.fetch = wrapFetchWithPayment(fetch, client);
    } else {
      this.fetch = fetch;
    }
  }

  async getQuote(tokenIn: string, tokenOut: string, amountIn: string) {
    const res = await this.fetch(
      `${this.config.apiUrl}/api/v1/quote?tokenIn=${tokenIn}&tokenOut=${tokenOut}&amountIn=${amountIn}`
    );
    return res.json();
  }

  async executeSwap(params: {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    walletAddress: string;
    slippage?: number;
  }) {
    const res = await this.fetch(`${this.config.apiUrl}/api/v1/swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    return res.json();
  }

  async getPrice(token: string) {
    const res = await this.fetch(
      `${this.config.apiUrl}/api/v1/price?token=${token}`
    );
    return res.json();
  }
}
```

---

## Phase 7: 环境变量

### `.env.example`

```env
# === Monad 配置 ===
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
MONAD_CHAIN_ID=10143

# === 合约地址（部署后填入）===
WMON_ADDRESS=0x...
OPENCLAW_FACTORY=0x...
OPENCLAW_ROUTER=0x...
OPENCLAW_QUOTER=0x...
OPENCLAW_POSITION_MANAGER=0x...

# === x402 配置 ===
PAY_TO_ADDRESS=0x...你的收款钱包地址
X402_FACILITATOR_URL=https://x402-facilitator.molandak.org
MONAD_USDC_ADDRESS=0x534b2f3A21130d7a60830c2Df862319e593943A3

# === Agent 配置 ===
OPENCLAW_MASTER_KEY=生成一个64位hex字符串
DEPLOYER_PRIVATE_KEY=0x...部署合约的私钥
ANTHROPIC_API_KEY=sk-ant-...（意图解析用）

# === 交易限制 ===
MAX_TRADE_SIZE=1000
DAILY_TRADE_LIMIT=10000
MAX_SLIPPAGE=0.05
```

---

## Phase 8: 开发顺序（Cursor 执行清单）

按以下顺序开发，每完成一步测试通过再进入下一步：

```
Step 1:  项目初始化（monorepo + 所有子包脚手架）
Step 2:  Monad chain 定义 + viem 配置（确保能连上 testnet）
Step 3:  Wallet Manager（创建钱包 + 查余额 — 用 vitest 测试）
Step 4:  Fork Uniswap V3 合约 + 部署脚本（先 local fork 测试）
Step 5:  部署合约到 Monad testnet
Step 6:  OpenClaw AMM Adapter（能报价 + 构建 swap calldata）
Step 7:  DEX Aggregator（先只接自建 DEX，后续加 Kuru 等）
Step 8:  x402 Server 搭建（付费 API 端点）
Step 9:  x402 Client（Agent 自动付费调用外部 API）
Step 10: Agent Core（自主模式 + 用户指令模式）
Step 11: 策略引擎（DCA 策略先行）
Step 12: 前端 Swap 界面
Step 13: 前端 Agent Dashboard
Step 14: SDK 封装 + npm 发布
```
