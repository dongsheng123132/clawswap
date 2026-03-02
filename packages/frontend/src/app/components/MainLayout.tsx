'use client';

import { useState, useEffect } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import SwapTab from './tabs/SwapTab';
import AgentTab from './tabs/AgentTab';
import EarnTab from './tabs/EarnTab';
import GridTab from './tabs/GridTab';
import TestnetBanner from './TestnetBanner';
import { useBalances } from '@/hooks/useBalances';

type TabId = 'swap' | 'agent' | 'earn' | 'grid';

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
          <div className="flex items-center gap-3">
            <span className="font-bold text-lg">OpenClaw</span>
            <a
              href="https://github.com/dongsheng123132/clawswap"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-500 hover:text-white transition-colors"
              title="GitHub"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            </a>
          </div>
          <nav className="hidden md:flex items-center gap-1">
            {(['swap', 'agent', 'earn', 'grid'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`
                  px-3 py-2 rounded-xl text-sm font-medium capitalize
                  ${tab === t ? 'bg-[#7C3AED] text-white' : 'text-zinc-400 hover:text-white'}
                `}
              >
                {t === 'swap' ? 'Swap' : t === 'agent' ? 'Agent' : t === 'earn' ? 'Earn' : 'Grid'}
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
        {tab === 'grid' && <GridTab />}
      </main>

      {/* Mobile bottom nav - tabs */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t border-zinc-800 bg-[#18181B]/95 backdrop-blur z-20">
        <div className="max-w-[480px] mx-auto flex justify-around py-2">
          {(['swap', 'agent', 'earn', 'grid'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`
                flex-1 py-2 rounded-xl text-sm font-medium capitalize
                ${tab === t ? 'bg-[#7C3AED] text-white' : 'text-zinc-400'}
              `}
            >
              {t === 'swap' ? 'Swap' : t === 'agent' ? 'Agent' : t === 'earn' ? 'Earn' : 'Grid'}
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
          <div>MON: {formatted.mon} | USDC: {formatted.usdc} | 总资产: ${totalUsd.toFixed(2)}</div>
          <a
            href="https://github.com/dongsheng123132/clawswap"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-zinc-500 hover:text-white text-xs mt-1 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
