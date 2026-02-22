'use client';

import { useState, useEffect } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import SwapTab from './tabs/SwapTab';
import AgentTab from './tabs/AgentTab';
import EarnTab from './tabs/EarnTab';
import TestnetBanner from './TestnetBanner';
import { useBalances } from '@/hooks/useBalances';

type TabId = 'swap' | 'agent' | 'earn';

function shortenAddress(addr: string) {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}..${addr.slice(-4)}`;
}

export default function MainLayout() {
  const { logout } = usePrivy();
  const { wallets } = useWallets();
  const [tab, setTab] = useState<TabId>('swap');
  const { mon, usdc, totalUsd, loading: balanceLoading, refresh, formatted } = useBalances();

  const address = wallets[0]?.address ?? '';

  useEffect(() => {
    if (address) refresh();
  }, [address, refresh]);

  const showTestnetBanner = totalUsd === 0 && !balanceLoading;

  return (
    <div className="min-h-screen bg-[#000] text-white flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-[#000]/95 backdrop-blur">
        <div className="max-w-[480px] mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-bold text-lg">OpenClaw</span>
          <nav className="hidden md:flex items-center gap-1">
            {(['swap', 'agent', 'earn'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`
                  px-3 py-2 rounded-xl text-sm font-medium capitalize
                  ${tab === t ? 'bg-[#7C3AED] text-white' : 'text-zinc-400 hover:text-white'}
                `}
              >
                {t === 'swap' ? 'Swap' : t === 'agent' ? 'Agent' : 'Earn'}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {address ? (
              <>
                <span className="text-sm font-mono text-zinc-400">{shortenAddress(address)}</span>
                <span className="w-2 h-2 rounded-full bg-[#22C55E]" title="已连接" />
                <button
                  type="button"
                  onClick={logout}
                  className="text-xs text-zinc-500 hover:text-zinc-300"
                >
                  退出
                </button>
              </>
            ) : (
              <span className="text-sm text-zinc-500">连接中...</span>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-[480px] w-full mx-auto px-4 py-6 pb-24 md:pb-6">
        {showTestnetBanner && address && (
          <TestnetBanner address={address} onRefresh={refresh} loading={balanceLoading} />
        )}
        {tab === 'swap' && <SwapTab />}
        {tab === 'agent' && <AgentTab />}
        {tab === 'earn' && <EarnTab />}
      </main>

      {/* Mobile bottom nav - tabs */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-zinc-800 bg-[#18181B]/95 backdrop-blur z-20">
        <div className="max-w-[480px] mx-auto flex justify-around py-2">
          {(['swap', 'agent', 'earn'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`
                flex-1 py-2 rounded-xl text-sm font-medium capitalize
                ${tab === t ? 'bg-[#7C3AED] text-white' : 'text-zinc-400'}
              `}
            >
              {t === 'swap' ? 'Swap' : t === 'agent' ? 'Agent' : 'Earn'}
            </button>
          ))}
        </div>
        <div className="max-w-[480px] mx-auto px-4 py-2 text-center text-xs text-zinc-500">
          MON: {formatted.mon} | USDC: {formatted.usdc} | 总资产: ${totalUsd.toFixed(2)}
        </div>
      </nav>

      {/* Desktop: top tabs only, footer balance bar */}
      <footer className="hidden md:block border-t border-zinc-800 bg-[#18181B] py-3">
        <div className="max-w-[480px] mx-auto px-4 text-center text-sm text-zinc-400">
          MON: {formatted.mon} | USDC: {formatted.usdc} | 总资产: ${totalUsd.toFixed(2)}
        </div>
      </footer>
    </div>
  );
}
