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

// Deployed on Monad Testnet (see packages/contracts/deployed-addresses.json)
export const CONTRACTS = {
  WMON: '0x21101761d8efb6c43de3cf12aab477d41763c210' as Address,
  USDC: '0x54766e965d19e49fbc781ad9beb73bf142d1a319' as Address,
  UNISWAP_FACTORY: '0x41515640cb63fe7a0f19e5dd752557b02bb4f299' as Address,
  SWAP_ROUTER: '0x40aaaeb202175c0400554a107da89528ba24647b' as Address,
  QUOTER_V2: '0x5a2e143c3c95d11fe7fa8f19b421150cfedf56ae' as Address,
  POSITION_MANAGER: '0x493f357a0216bc9eed26bbe431d960aa2ec4a33f' as Address,
} as const;

export const MONAD_CONTRACTS = {
  USDC: CONTRACTS.USDC,
  WMON: CONTRACTS.WMON,
  SwapRouter: CONTRACTS.SWAP_ROUTER,
  Quoter: CONTRACTS.QUOTER_V2,
  Factory: CONTRACTS.UNISWAP_FACTORY,
  NonfungiblePositionManager: CONTRACTS.POSITION_MANAGER,
} as const;
