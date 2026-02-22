'use client';

import { useState, useEffect } from 'react';
import { getApiUrl } from '@/lib/api';

const ENDPOINT_LABELS: Record<string, string> = {
  '/api/v1/quote': '报价 API',
  '/api/v1/swap': '交易 API',
  '/api/v1/price': '价格数据 API',
};
const ENDPOINT_PRICES: Record<string, string> = {
  '/api/v1/quote': '$0.0001/次',
  '/api/v1/swap': '$0.001/次',
  '/api/v1/price': '$0.0001/次',
};

const SDK_CODE = `// 其他 Agent 调用你的 API：
const sdk = new OpenClawSDK({
  apiUrl: "https://openclaw.xyz",
  walletKey: "0x..."
});
// 自动通过 x402 付费 $0.0001 USDC
const quote = await sdk.getQuote(
  "USDC", "MON", "100"
);`;

type EarnStats = {
  today: { calls: number; paid: number };
  monthly: { calls: number; paid: number };
  total: { calls: number; paid: number };
  endpoints: { endpoint: string; calls: number; paid: number }[];
};

export default function EarnTab() {
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<EarnStats | null>(null);

  useEffect(() => {
    fetch(getApiUrl('/api/v1/earn/stats'))
      .then((r) => (r.ok ? r.json() : null))
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  const copyCode = () => {
    navigator.clipboard.writeText(SDK_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const endpoints = stats?.endpoints ?? [];
  const today = stats?.today ?? { calls: 0, paid: 0 };
  const monthly = stats?.monthly ?? { calls: 0, paid: 0 };
  const total = stats?.total ?? { calls: 0, paid: 0 };

  return (
    <div className="space-y-6">
      <div className="bg-[#18181B] rounded-2xl p-6 border border-zinc-800">
        <h2 className="text-lg font-bold mb-2">x402 API 收益</h2>
        <p className="text-zinc-400 text-sm mb-6">
          你的 API 被其他 AI Agent 调用时，你可以通过 x402 协议自动收取 USDC。
        </p>
        <p className="text-zinc-500 text-sm mb-4">—— 你的 API 端点 ——</p>
        <ul className="space-y-4">
          {endpoints.length > 0 ? (
            endpoints.map((ep) => (
              <li
                key={ep.endpoint}
                className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-800"
              >
                <div className="font-medium text-zinc-300">
                  {ENDPOINT_LABELS[ep.endpoint] ?? ep.endpoint}
                </div>
                <div className="text-zinc-500 text-sm font-mono mt-1">{ep.endpoint}</div>
                <div className="flex justify-between items-center mt-2 text-sm">
                  <span className="text-zinc-400">
                    价格: {ENDPOINT_PRICES[ep.endpoint] ?? '-'} | 调用: {ep.calls} 次
                  </span>
                  <span className="text-[#22C55E]">收入: ${ep.paid.toFixed(4)}</span>
                </div>
              </li>
            ))
          ) : (
            <li className="text-zinc-500 text-sm">暂无付费调用记录</li>
          )}
        </ul>
        <div className="mt-6 pt-4 border-t border-zinc-800">
          <p className="text-zinc-500 text-sm mb-2">—— 收益汇总 ——</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-500">今日</span>
              <span className="text-zinc-300">${today.paid.toFixed(4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">本月</span>
              <span className="text-zinc-300">${monthly.paid.toFixed(4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">总计</span>
              <span className="text-zinc-300">${total.paid.toFixed(4)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[#18181B] rounded-2xl p-6 border border-zinc-800">
        <h3 className="font-medium text-zinc-300 mb-3">x402 使用方法（给其他 Agent 开发者）</h3>
        <pre className="bg-zinc-900 rounded-xl p-4 text-xs text-zinc-400 overflow-x-auto font-mono whitespace-pre">
          {SDK_CODE}
        </pre>
        <button
          type="button"
          onClick={copyCode}
          className="mt-3 px-4 py-2 rounded-xl bg-[#7C3AED] hover:bg-violet-600 text-white text-sm font-medium"
        >
          {copied ? '已复制' : '复制代码'}
        </button>
      </div>
    </div>
  );
}
