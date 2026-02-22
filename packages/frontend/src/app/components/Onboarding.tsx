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
            onClick={() => login({ loginMethods: ['twitter'] })}
            className="w-full bg-[#7C3AED] hover:bg-violet-600 text-white font-medium py-4 rounded-2xl transition-colors flex items-center justify-center gap-2"
          >
            <span>用 Twitter 登录</span>
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

        <p className="text-zinc-500 text-xs">Testnet 模式 · 所有代币无真实价值</p>
      </div>
    </div>
  );
}
