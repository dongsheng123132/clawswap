# Cursor Prompt: 在 Monad 测试网部署 Uniswap V3 + 跑通 Swap

## 背景

项目 `packages/contracts/` 已有完整的 Uniswap V3 合约源码（OpenClawFactory/Pool/SwapRouter/Quoter/NFPM），以及 WMON 和 TestUSDC 代币合约。但目前这些合约**还没有部署到 Monad 测试网**，前端 `chains.ts` 中的地址是占位符（链上没有代码）。

需要：
1. 修复 Foundry 编译问题
2. 部署所有合约到 Monad 测试网
3. 创建 WMON/USDC 流动性池并添加初始流动性
4. 更新前端合约地址
5. 让用户能在前端领取测试 USDC 并完成 Swap

---

## Prompt 1: 修复 Foundry 编译环境

```
修复 packages/contracts/ 的 Foundry 编译问题。

当前问题：
1. lib/forge-std v1.15.0 要求 solc >=0.8.13，但合约使用 solc 0.7.6
2. base64-sol 依赖缺失
3. 部分 periphery 文件有外部依赖缺失 (V3Migrator 需要 v2-core)

解决方案 - 不修改任何合约源码，只修改编译配置：

1. 降级 forge-std 到 v1.5.6（最后一个支持 solc 0.6+ 的版本）：
   cd packages/contracts
   rm -rf lib/forge-std
   forge install foundry-rs/forge-std@v1.5.6 --no-git --no-commit

2. 安装 base64-sol 依赖：
   forge install Brechtpd/base64@v0.1.1 --no-git --no-commit
   或者直接创建 lib/base64-sol/base64.sol 文件（从 npm base64-sol 包复制）

3. foundry.toml 配置：
   [profile.default]
   src = 'src'
   out = 'out'
   libs = ['lib']
   solc_version = "0.7.6"
   evm_version = "paris"
   optimizer = true
   optimizer_runs = 200
   ignore = [
     "src/core/test/**",
     "src/periphery/test/**",
     "src/periphery/examples/**",
     "src/periphery/V3Migrator.sol",
     "src/periphery/NonfungibleTokenPositionDescriptor.sol",
     "src/periphery/lens/**",
   ]

4. remappings.txt：
   @uniswap/v3-core/contracts/=src/core/
   @uniswap/v3-periphery/contracts/=src/periphery/
   @openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/
   forge-std/=lib/forge-std/src/
   base64-sol/=lib/base64-sol/

5. 验证编译通过：
   forge build

目标：`forge build` 零错误，out/ 目录生成所有需要的 artifact JSON。
```

---

## Prompt 2: 编写 Node.js 部署脚本

```
在 packages/contracts/ 创建 deploy.mjs Node.js 部署脚本。
使用 viem 库（项目已安装）部署所有合约到 Monad 测试网。

环境变量（从项目根目录 .env 读取）：
- PRIVATE_KEY=1286a80ec241346ebdc83986a66e33316bdd7b2f452a97742b9b25203bd554c5
- 部署者地址: 0x408E2fC4FCAF2D38a6C9dcF07C6457bdFb6e0250
- 部署者余额: ~1.19 MON（gas 足够）

Monad 测试网配置：
- Chain ID: 10143
- RPC: https://testnet-rpc.monad.xyz
- 原生代币: MON (18 decimals)

脚本流程：

1. 读取 out/ 目录下的编译 artifact（JSON 文件包含 abi 和 bytecode）
   - out/WMON.sol/WMON.json
   - out/TestUSDC.sol/TestUSDC.json
   - out/OpenClawFactory.sol/OpenClawFactory.json
   - out/SwapRouter.sol/SwapRouter.json
   - out/Quoter.sol/QuoterV2.json（注意 Quoter.sol 里的类名是 QuoterV2）
   - out/NonfungiblePositionManager.sol/NonfungiblePositionManager.json

2. 使用 viem 连接 Monad 测试网

3. 按顺序部署合约（每次部署等待确认）：
   a. WMON（无构造参数）
   b. TestUSDC（无构造参数）
   c. OpenClawFactory（无构造参数）
   d. SwapRouter（构造参数：factory地址, wmon地址）
   e. QuoterV2（构造参数：factory地址, wmon地址）
   f. NonfungiblePositionManager（构造参数：factory地址, wmon地址, address(0)）

4. Mint 测试 USDC：调用 usdc.mint(deployer, 1_000_000 * 10^6)

5. Wrap MON 为 WMON：发送 0.5 MON 到 WMON 合约的 deposit()

6. 创建流动性池：
   - 调用 factory.createPool(token0, token1, 3000)
   - token0 和 token1 按地址大小排序（小的是 token0）
   - 初始化池子价格：
     如果 token0 = WMON: 1 MON ≈ 0.40 USDC
       sqrtPriceX96 = sqrt(0.4 * 10^6 / 10^18) * 2^96 ≈ 50_122_627_039_097
     如果 token0 = USDC: 1 MON ≈ 0.40 USDC
       sqrtPriceX96 = sqrt(10^18 / (0.4 * 10^6)) * 2^96 ≈ 125_270_724_187_256_972_849_283_072
   - 调用 pool.initialize(sqrtPriceX96)

7. 添加流动性：
   - 先 approve WMON 和 USDC 给 NFPM（max uint256）
   - 调用 nfpm.mint({
       token0, token1,
       fee: 3000,
       tickLower: -887220,  // 全范围
       tickUpper: 887220,
       amount0Desired: (token0是WMON ? 0.4e18 : 100_000e6),
       amount1Desired: (token1是WMON ? 0.4e18 : 100_000e6),
       amount0Min: 0,
       amount1Min: 0,
       recipient: deployer,
       deadline: currentTimestamp + 3600
     })

8. 打印所有部署地址：
   console.log('=== 部署结果 ===');
   console.log('WMON:', wmonAddress);
   console.log('USDC:', usdcAddress);
   console.log('Factory:', factoryAddress);
   console.log('SwapRouter:', routerAddress);
   console.log('QuoterV2:', quoterAddress);
   console.log('NFPM:', nfpmAddress);
   console.log('Pool:', poolAddress);

9. 将结果写入 packages/contracts/deployed-addresses.json：
   {
     "WMON": "0x...",
     "USDC": "0x...",
     "Factory": "0x...",
     "SwapRouter": "0x...",
     "QuoterV2": "0x...",
     "NFPM": "0x...",
     "Pool": "0x..."
   }

脚本必须：
- 每步打印进度日志
- 每次交易等待 receipt 确认
- 出错时打印具体错误信息
- 使用 ES module (import/export)

运行命令：
  cd packages/contracts
  node deploy.mjs

注意：如果 viem 未安装，先 npm init -y && npm install viem dotenv
```

---

## Prompt 3: 更新前端合约地址

```
部署完成后，根据 packages/contracts/deployed-addresses.json 中的实际地址，
更新前端文件 packages/frontend/src/lib/chains.ts 中的合约地址。

当前 chains.ts 中的地址是占位符，需要替换为实际部署的地址：

export const CONTRACTS = {
  WMON: '新地址' as Address,
  USDC: '新地址' as Address,
  UNISWAP_FACTORY: '新地址' as Address,
  SWAP_ROUTER: '新地址' as Address,
  QUOTER_V2: '新地址' as Address,
  POSITION_MANAGER: '新地址' as Address,
} as const;

同时更新 SwapTab.tsx 中的硬编码地址：
const SWAP_ROUTER = '新地址' as Address;
const WMON = '新地址' as Address;
const USDC_ADDR = '新地址' as Address;

更新后重新构建前端：
  cd packages/frontend
  rm -rf .next
  npm run build
```

---

## Prompt 4: 前端添加「领取测试 USDC」功能

```
修改 packages/frontend/src/app/components/TestnetBanner.tsx，
添加一个「领取测试 USDC」按钮，直接调用 TestUSDC 合约的 mint 函数。

TestUSDC 合约的 mint 是公开的，任何人都可以调用：
  function mint(address to, uint amount) external

实现：
1. 在 TestnetBanner 组件中添加按钮 "领取 1000 USDC"
2. 点击后使用 viem 的 writeContract 调用 TestUSDC.mint(userAddress, 1000 * 10^6)
3. 使用 wallets[0] 的 provider 发送交易（Privy embedded wallet）
4. 交易确认后自动刷新余额

关键代码：
import { createWalletClient, custom } from 'viem';
import { monadTestnet, MONAD_CONTRACTS } from '@/lib/chains';

const USDC_MINT_ABI = [
  { name: 'mint', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [] }
] as const;

// 在组件内：
const handleMintUSDC = async () => {
  const provider = await wallets[0].getEthereumProvider();
  const walletClient = createWalletClient({
    chain: monadTestnet,
    transport: custom(provider),
  });
  const [account] = await walletClient.getAddresses();
  const hash = await walletClient.writeContract({
    address: MONAD_CONTRACTS.USDC,
    abi: USDC_MINT_ABI,
    functionName: 'mint',
    args: [account, BigInt(1000 * 1e6)],
    account,
  });
  // 等待确认后刷新余额
};

注意：useWallets 需要从 '@privy-io/react-auth' 导入。
```

---

## Prompt 5: 验证 Swap 端到端流程

```
验证 Swap 功能端到端可用：

1. 确认合约部署正确：
   用 curl 或 cast 检查所有合约地址都有代码：
   curl -s -X POST https://testnet-rpc.monad.xyz \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"eth_getCode","params":["<address>","latest"],"id":1}'

   结果不应该是 "0x"（空代码）。

2. 确认池子存在且有流动性：
   调用 Factory.getPool(USDC, WMON, 3000) 确认返回非零地址
   调用 Pool.slot0() 确认 sqrtPriceX96 非零
   调用 Pool.liquidity() 确认流动性大于 0

3. 测试 Quote：
   在前端输入 1 USDC，应该能看到对应的 MON 数量（约 2.5 MON）

4. 测试 Swap（需要先有测试代币）：
   - 通过水龙头获取 MON
   - 通过 TestUSDC.mint 获取 USDC
   - 执行 USDC → MON swap
   - 确认交易成功，余额变化正确

如果 Quote 返回 null / 报错 "pool may not exist"：
- 检查 Quoter 合约地址是否正确
- 检查 useQuote.ts 中的 ABI 是否匹配（应该是 QuoterV2 的 quoteExactInputSingle）
- 检查 fee 参数是否为 3000
- 检查 Factory 地址和 Pool 的 PoolAddress 计算是否一致（Quoter 内部通过 Factory 计算 Pool 地址）

如果 Swap 失败：
- 检查 SwapRouter 地址
- 检查 approve 是否成功
- 检查 amountOutMinimum 是否合理
- 检查 deadline 是否在未来
```

---

## 执行顺序

1. **Prompt 1** → 修复编译 → `forge build` 成功
2. **Prompt 2** → 运行 `node deploy.mjs` → 部署所有合约 + 创建池子 + 添加流动性
3. **Prompt 3** → 用部署结果更新前端地址 → 重新构建
4. **Prompt 4** → 添加领取测试 USDC 功能
5. **Prompt 5** → 端到端验证

## 关键路径

```
forge build → deploy.mjs → deployed-addresses.json → 更新 chains.ts → npm run build → 部署到 Vercel
```

## 重要注意事项

- 部署者私钥：1286a80ec241346ebdc83986a66e33316bdd7b2f452a97742b9b25203bd554c5
- 部署者地址：0x408E2fC4FCAF2D38a6C9dcF07C6457bdFb6e0250
- 部署者余额：~1.19 MON（应该足够部署所有合约）
- Monad 测试网 RPC：https://testnet-rpc.monad.xyz
- Chain ID：10143
- 前端 Vercel 部署命令（更新地址后）：
  ```
  cd packages/frontend
  FORCE_TTY=1 npx vercel deploy --yes --prod --force \
    -e NEXT_PUBLIC_API_URL=https://clawswap-server.vercel.app \
    -e NEXT_PUBLIC_PRIVY_APP_ID=cmlhyxxba00u7ie0cb5eqknhd \
    -e NEXT_PUBLIC_ZERODEV_PROJECT_ID=e603c4b9-8c62-4a25-9308-9a7269520fdc
  ```
