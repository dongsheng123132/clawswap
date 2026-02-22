import {
  createPublicClient,
  http,
  defineChain,
  parseAbi,
  formatUnits,
  formatEther,
  type Address,
} from 'viem';

// ============ Monad Testnet Chain ============
export const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://testnet-rpc.monad.xyz'] },
  },
  blockExplorers: {
    default: {
      name: 'Monad Explorer',
      url: 'https://testnet.monadexplorer.com',
    },
  },
  testnet: true,
});

// ============ Contract Addresses ============
// Uniswap V3 on Monad Testnet (verified working)
export const CONTRACTS = {
  WMON: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A' as Address,
  USDC: '0x534b2f3A21130d7a60830c2Df862319e593943A3' as Address,
  UNISWAP_FACTORY: '0x204faca1764b154221e35c0d20abb3c525710498' as Address,
  SWAP_ROUTER: '0xfe31f71c1b106eac32f1a19239c9a9a72ddfb900' as Address,
  QUOTER_V2: '0x661e93cca42afacb172121ef892830ca3b70f08d' as Address,
  POSITION_MANAGER: '0x7197e214c0b767cfb76fb734ab638e2c192f4e53' as Address,
} as const;

// 兼容旧代码的别名
export const MONAD_CONTRACTS = {
  USDC: CONTRACTS.USDC,
  WMON: CONTRACTS.WMON,
  SwapRouter: CONTRACTS.SWAP_ROUTER,
  Quoter: CONTRACTS.QUOTER_V2,
  Factory: CONTRACTS.UNISWAP_FACTORY,
  NonfungiblePositionManager: CONTRACTS.POSITION_MANAGER,
} as const;

// ============ ABIs ============
export const ERC20_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
]);

// 重要: QuoterV2 使用 struct 参数格式，不是展开的参数
export const QUOTER_V2_ABI = parseAbi([
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
]);

// 重要: SwapRouter 也使用 struct 参数格式
export const SWAP_ROUTER_ABI = parseAbi([
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)',
]);

// ============ Public Client ============
export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(),
});

// ============ Helper Functions ============

export async function getBalances(address: Address) {
  const [monBalance, usdcBalance] = await Promise.all([
    publicClient.getBalance({ address }),
    publicClient.readContract({
      address: CONTRACTS.USDC,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [address],
    }),
  ]);

  return {
    mon: formatEther(monBalance),
    usdc: formatUnits(usdcBalance, 6),
    monRaw: monBalance,
    usdcRaw: usdcBalance,
  };
}

export async function getQuote(
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  fee: number = 3000
): Promise<{ amountOut: bigint; gasEstimate: bigint } | null> {
  try {
    const result = await publicClient.simulateContract({
      address: CONTRACTS.QUOTER_V2,
      abi: QUOTER_V2_ABI,
      functionName: 'quoteExactInputSingle',
      args: [
        {
          tokenIn,
          tokenOut,
          amountIn,
          fee,
          sqrtPriceLimitX96: 0n,
        },
      ],
    });
    const [amountOut, , , gasEstimate] = result.result as [bigint, bigint, number, bigint];
    return { amountOut, gasEstimate };
  } catch {
    return null;
  }
}

/** 获取 1 MON 的 USDC 价格 */
export async function getMonPrice(): Promise<number | null> {
  const oneWmon = 10n ** 18n; // 1 WMON
  const quote = await getQuote(CONTRACTS.WMON, CONTRACTS.USDC, oneWmon);
  if (!quote) return null;
  return Number(formatUnits(quote.amountOut, 6));
}

/** 符号 → 地址映射 */
export function symbolToAddress(symbol: string): Address | null {
  const s = symbol.toUpperCase();
  if (s === 'MON' || s === 'WMON') return CONTRACTS.WMON;
  if (s === 'USDC') return CONTRACTS.USDC;
  return null;
}

/** 符号 → 精度映射 */
export function symbolToDecimals(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s === 'MON' || s === 'WMON') return 18;
  if (s === 'USDC') return 6;
  return 18;
}
