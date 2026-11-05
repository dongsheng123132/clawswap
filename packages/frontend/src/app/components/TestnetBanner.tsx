'use client';

import { useState } from 'react';
import { createWalletClient, createPublicClient, custom, http } from 'viem';
import { useWallets } from '@privy-io/react-auth';
import { monadTestnet, MONAD_CONTRACTS } from '@/lib/chains';

const MONAD_FAUCET_URL = 'https://faucet.monad.xyz';

const USDC_MINT_ABI = [
  {
    name: 'mint',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

export default function TestnetBanner({
  address,
  onRefresh,
  loading = false,
}: {
  address: string;
  onRefresh: () => void;
  loading?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [minting, setMinting] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);
  const { wallets } = useWallets();

  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleMintUSDC = async () => {
    const wallet = wallets[0];
    if (!wallet || !address) {
      setMintError('请先连接钱包');
      return;
    }
    setMintError(null);
    setMinting(true);
    try {
      const provider = await wallet.getEthereumProvider();
      const walletClient = createWalletClient({
        chain: monadTestnet,
        transport: custom(provider),
      });
      const [account] = await walletClient.getAddresses();
      if (!account) throw new Error('No account');
      const hash = await walletClient.writeContract({
        address: MONAD_CONTRACTS.USDC,
        abi: USDC_MINT_ABI,
        functionName: 'mint',
        args: [account, BigInt(1000 * 1e6)],
        account,
      });
      const publicClient = createPublicClient({
        chain: monadTestnet,
        transport: http(monadTestnet.rpcUrls.default.http[0]),
      });
      await publicClient.waitForTransactionReceipt({ hash });
      onRefresh();
    } catch (e: unknown) {
      setMintError(e instanceof Error ? e.message : '领取失败');
    } finally {
      setMinting(false);
    }
  };

  return (
    <div className="mb-6 bg-[#18181B] rounded-2xl border border-zinc-800 p-6">
      <p className="text-zinc-300 font-medium mb-4">测试网模式 — 需要测试代币才能体验</p>
      <div className="space-y-4">
        <div>
          <p className="text-zinc-500 text-sm mb-2">Step 1: 领取 MON 测试币</p>
          <a
            href={MONAD_FAUCET_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-[#7C3AED] hover:bg-violet-600 text-white text-sm font-medium"
          >
            前往 Monad 水龙头领取 MON
          </a>
          {address && (
            <p className="text-zinc-500 text-sm mt-2">
              你的钱包地址: {address.slice(0, 6)}...{address.slice(-4)}{' '}
              <button
                type="button"
                onClick={copyAddress}
                className="text-[#7C3AED] hover:underline"
              >
                {copied ? '已复制' : '复制'}
              </button>
            </p>
          )}
        </div>
        <div>
          <p className="text-zinc-500 text-sm mb-2">Step 2: 领取测试 USDC</p>
          <button
            type="button"
            onClick={handleMintUSDC}
            disabled={minting || !wallets?.length}
            className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-[#7C3AED] hover:bg-violet-600 text-white text-sm font-medium disabled:opacity-50"
          >
            {minting ? '领取中...' : '领取 1000 USDC'}
          </button>
          {mintError && <p className="text-red-400 text-sm mt-2">{mintError}</p>}
        </div>
        <div>
          <p className="text-zinc-500 text-sm mb-2">Step 3: 开始交易</p>
          <p className="text-zinc-500 text-sm mb-2">领到代币后回到这里，刷新余额即可开始。</p>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="px-4 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium disabled:opacity-50"
          >
            {loading ? '刷新中...' : '刷新余额'}
          </button>
        </div>
      </div>
    </div>
  );
}
