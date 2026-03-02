'use client';

import { usePrivy } from '@privy-io/react-auth';

export default function Onboarding() {
  const { login } = usePrivy();

  return (
    <div className="min-h-screen bg-[#000] text-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md text-center space-y-8">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold">OpenClaw</h1>
          <p className="text-zinc-400 text-lg">AI Agent 帮你在 Monad 上自动交易</p>
        </div>

        <div className="bg-[#18181B] rounded-2xl p-6 border border-zinc-800 text-left">
          <p className="text-zinc-500 text-sm mb-2">例如你可以说：</p>
          <ul className="text-zinc-300 space-y-1 text-sm">
            <li>&quot;每小时帮我定投 10 USDC 买 MON&quot;</li>
            <li>&quot;新币上线自动买入 0.1 MON&quot;</li>
            <li>&quot;MON 涨到 0.5U 自动卖掉&quot;</li>
          </ul>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => login({ loginMethods: ['google'] })}
            className="w-full bg-[#7C3AED] hover:bg-violet-600 text-white font-medium py-4 rounded-2xl transition-colors flex items-center justify-center gap-2"
          >
            <span>用 Google 登录</span>
          </button>
          <button
            type="button"
            onClick={() => login({ loginMethods: ['email'] })}
            className="w-full bg-[#18181B] hover:bg-zinc-800 border border-zinc-700 text-white font-medium py-4 rounded-2xl transition-colors flex items-center justify-center gap-2"
          >
            <span>用 Email 登录</span>
          </button>
          <button
            type="button"
            onClick={() => login({ loginMethods: ['wallet'] })}
            className="w-full bg-[#18181B] hover:bg-zinc-800 border border-zinc-700 text-white font-medium py-4 rounded-2xl transition-colors flex items-center justify-center gap-2"
          >
            <span>连接已有钱包</span>
          </button>
        </div>

        <a
          href="https://github.com/dongsheng123132/clawswap"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-zinc-500 hover:text-white text-sm transition-colors"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
          GitHub
        </a>
        <p className="text-zinc-500 text-xs">Testnet 模式 · 所有代币无真实价值</p>
      </div>
    </div>
  );
}
