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
    return {
      walletClient: _walletClient,
      publicClient: _publicClient,
      address: _address,
    };
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
  return {
    walletClient: _walletClient,
    publicClient: _publicClient,
    address: _address,
  };
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

export async function ensureApproval(
  tokenAddress: Address,
  spender: Address,
  amount: bigint
) {
  const { walletClient, publicClient, address } = getAgentWallet();
  const allowance = (await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [address, spender],
  })) as bigint;

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
