'use client';

import { useState } from 'react';

const MONAD_FAUCET_URL = 'https://faucet.monad.xyz';
const USDC_FAUCET_URL = 'https://faucet.circle.com';

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

  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
          <a
            href={USDC_FAUCET_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-[#7C3AED] hover:bg-violet-600 text-white text-sm font-medium"
          >
            前往 Circle 水龙头领取 USDC
          </a>
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
