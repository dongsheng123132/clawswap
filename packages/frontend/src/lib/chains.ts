import { defineChain, type Address } from 'viem';

export const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  network: 'monad-testnet',
  nativeCurrency: { decimals: 18, name: 'Monad', symbol: 'MON' },
  rpcUrls: {
    default: { http: ['https://testnet-rpc.monad.xyz'] },
    public: { http: ['https://testnet-rpc.monad.xyz'] },
  },
  blockExplorers: {
    default: { name: 'Monad Explorer', url: 'https://testnet.monadexplorer.com' },
  },
});

export const CONTRACTS = {
  WMON: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A' as Address,
  USDC: '0x534b2f3A21130d7a60830c2Df862319e593943A3' as Address,
  UNISWAP_FACTORY: '0x204faca1764b154221e35c0d20abb3c525710498' as Address,
  SWAP_ROUTER: '0xfe31f71c1b106eac32f1a19239c9a9a72ddfb900' as Address,
  QUOTER_V2: '0x661e93cca42afacb172121ef892830ca3b70f08d' as Address,
  POSITION_MANAGER: '0x7197e214c0b767cfb76fb734ab638e2c192f4e53' as Address,
} as const;

export const MONAD_CONTRACTS = {
  USDC: CONTRACTS.USDC,
  WMON: CONTRACTS.WMON,
  SwapRouter: CONTRACTS.SWAP_ROUTER,
  Quoter: CONTRACTS.QUOTER_V2,
  Factory: CONTRACTS.UNISWAP_FACTORY,
  NonfungiblePositionManager: CONTRACTS.POSITION_MANAGER,
} as const;
