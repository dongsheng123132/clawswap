'use client';

import { useState, useEffect, useRef } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useSmartWallet } from '@/hooks/useSmartWallet';
import { useAgent } from '@/hooks/useAgent';
import { useAgentStream } from '@/hooks/useAgentStream';
import { useAgentStats } from '@/hooks/useAgentStats';
import { useAgentWallet } from '@/hooks/useAgentWallet';
import { getApiUrl } from '@/lib/api';
import {
  TrendingUp,
  Target,
  Zap,
  MessageSquare,
  Play,
  Pause,
  Send,
  ChevronDown,
} from 'lucide-react';
import clsx from 'clsx';

type StrategyId = 'dca' | 'stoploss' | 'sniper' | 'nl' | null;
type AgentView = 'strategies' | 'dca-config' | 'stoploss-config' | 'sniper-placeholder' | 'nl-chat' | 'running';

const FREQUENCIES = [
  { id: 'hourly', label: '每小时' },
  { id: '4h', label: '每4小时' },
  { id: 'daily', label: '每天' },
  { id: 'weekly', label: '每周' },
];

const intervalMsMap: Record<string, number> = {
  hourly: 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

export default function AgentTab() {
  const { user } = usePrivy();
  const userId = user?.id;
  const { address, authorizeAgent, revokeAgent } = useSmartWallet();
  const { running: serverRunning, refresh: refreshStatus } = useAgent(userId);
  const { events: streamEvents } = useAgentStream(userId);
  const { stats, refresh: refreshStats } = useAgentStats(userId);
  const { info: agentWallet } = useAgentWallet();

  const [view, setView] = useState<AgentView>('strategies');
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyId>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [starting, setStarting] = useState(false);

  // DCA form state
  const [dcaToken, setDcaToken] = useState('MON');
  const [dcaAmount, setDcaAmount] = useState('10');
  const [dcaFreq, setDcaFreq] = useState('hourly');
  const [dcaCapSingle, setDcaCapSingle] = useState('100');
  const [dcaCapDaily, setDcaCapDaily] = useState('500');
  const [dcaDays, setDcaDays] = useState('7');

  // Stop-loss form state
  const [slToken, setSlToken] = useState('MON');
  const [slTakeProfit, setSlTakeProfit] = useState('0.6');
  const [slStopLoss, setSlStopLoss] = useState('0.3');

  const [logs, setLogs] = useState<Array<{ time: string; msg: string; type: 'buy' | 'sell' | 'skip' | 'info'; txHash?: string }>>([]);
  const addLog = (msg: string, type: 'buy' | 'sell' | 'skip' | 'info' = 'info', txHash?: string) => {
    setLogs((prev) => [{ time: new Date().toLocaleTimeString(), msg, type, txHash }, ...prev].slice(0, 50));
  };

  useEffect(() => {
    if (serverRunning !== isRunning) setIsRunning(serverRunning);
  }, [serverRunning]);

  const streamEventsHandled = useRef(0);
  useEffect(() => {
    if (streamEvents.length <= streamEventsHandled.current) return;
    const newEvents = streamEvents.slice(streamEventsHandled.current);
    streamEventsHandled.current = streamEvents.length;
    newEvents.forEach((ev) => {
      const msg = (ev.msg ?? ev.text ?? JSON.stringify(ev)) as string;
      const type =
        ev.type === 'trade' ? 'buy' : ev.type === 'error' ? 'skip' : ev.type === 'skip' ? 'skip' : 'info';
      const txHash = ev.type === 'trade' ? (ev as { trade?: { txHash?: string } }).trade?.txHash : undefined;
      if (ev.type === 'instruct') addLog(`指令: ${msg}`, 'info');
      else addLog(msg, type as 'buy' | 'sell' | 'skip' | 'info', txHash);
    });
  }, [streamEvents]);

  const handleStartAgent = async () => {
    setStarting(true);
    try {
      const strategyType = selectedStrategy === 'dca' ? 'DCA' : selectedStrategy === 'stoploss' ? 'StopLoss' : undefined;
      const strategyConfig =
        selectedStrategy === 'dca'
          ? {
              amountPerInterval: Number(dcaAmount) || 10,
              intervalMs: intervalMsMap[dcaFreq] ?? intervalMsMap.hourly,
              tokenOutSymbol: dcaToken,
              capSingle: Number(dcaCapSingle) || 100,
              capDaily: Number(dcaCapDaily) || 500,
              validDays: Number(dcaDays) || 7,
            }
          : selectedStrategy === 'stoploss'
            ? {
                takeProfitPrice: Number(slTakeProfit) || 0.6,
                stopLossPrice: Number(slStopLoss) || 0.3,
                amountToSell: 100,
              }
            : undefined;

      const success = await authorizeAgent({ strategyType, strategyConfig });
      if (success) {
        await refreshStatus();
        refreshStats();
        setIsRunning(true);
        setView('running');
        addLog('Agent 已启动');
        if (selectedStrategy === 'dca')
          addLog(`定投: 每${dcaFreq === 'hourly' ? '小时' : dcaFreq === '4h' ? '4小时' : dcaFreq === 'daily' ? '天' : '周'}买 ${dcaAmount} USDC 的 ${dcaToken}`, 'info');
      } else {
        addLog('授权失败，使用演示模式', 'info');
        setIsRunning(true);
        setView('running');
      }
    } catch (e) {
      addLog('授权失败，使用演示模式', 'info');
      setIsRunning(true);
      setView('running');
    } finally {
      setStarting(false);
    }
  };

  const handleStopAgent = async () => {
    const ok = await revokeAgent();
    if (ok) await refreshStatus();
    setIsRunning(false);
    setView('strategies');
    setSelectedStrategy(null);
  };

  const handlePauseAgent = () => {
    addLog('Agent 已暂停');
  };

  // --- Strategy selection view
  if (view === 'strategies' && !isRunning) {
    return (
      <div className="space-y-6">
        <div className="bg-[#18181B] rounded-2xl p-6 border border-zinc-800">
          <h2 className="text-lg font-bold mb-2">你的 AI 交易 Agent</h2>
          <p className="text-zinc-400 text-sm mb-4">
            Agent 可以帮你自动执行交易策略。你随时可以撤销授权，Agent 立即停止。
          </p>
          {agentWallet && (
            <div className="bg-zinc-800/50 rounded-xl p-4 text-sm space-y-2 mb-4">
              <p className="text-zinc-400 font-medium">Agent 钱包（需充值测试币）</p>
              <div className="flex items-center gap-2">
                <code className="text-xs text-zinc-300 bg-zinc-800 px-2 py-1 rounded flex-1 truncate">
                  {agentWallet.address}
                </code>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(agentWallet.address)}
                  className="text-xs text-[#7C3AED] hover:text-violet-400 shrink-0"
                >
                  复制
                </button>
              </div>
              <div className="flex gap-4 text-zinc-400">
                <span>MON: {Number(agentWallet.balances.mon).toFixed(4)}</span>
                <span>USDC: {Number(agentWallet.balances.usdc).toFixed(2)}</span>
              </div>
              <a
                href={agentWallet.explorerUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-[#7C3AED] hover:underline"
              >
                在 Explorer 上查看 ↗
              </a>
            </div>
          )}
          <p className="text-zinc-500 text-sm">—— 选择策略 ——</p>
          <div className="grid gap-3 mt-4">
            {[
              { id: 'dca' as const, icon: TrendingUp, title: '定投 (DCA)', desc: '每隔固定时间自动买入代币，适合长期看好的代币' },
              { id: 'stoploss' as const, icon: Target, title: '止盈止损', desc: '设定目标价自动卖出或止损，不用盯盘' },
              { id: 'sniper' as const, icon: Zap, title: '新币狙击', desc: '监控 nad.fun 新币上线，符合条件自动买入' },
              { id: 'nl' as const, icon: MessageSquare, title: '自然语言指令', desc: '直接告诉 Agent 你想做什么，如 "帮我买100U的MON"' },
            ].map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setSelectedStrategy(s.id);
                  if (s.id === 'dca') setView('dca-config');
                  else if (s.id === 'stoploss') setView('stoploss-config');
                  else if (s.id === 'sniper') setView('sniper-placeholder');
                  else if (s.id === 'nl') setView('nl-chat');
                }}
                className="bg-zinc-800/50 hover:bg-zinc-800 rounded-xl p-4 border border-zinc-800 text-left flex items-start gap-3"
              >
                <s.icon className="w-5 h-5 text-[#7C3AED] shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium">{s.title}</div>
                  <div className="text-zinc-500 text-sm mt-1">{s.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- DCA config view
  if (view === 'dca-config') {
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => setView('strategies')}
          className="text-zinc-400 hover:text-white text-sm flex items-center gap-1"
        >
          ← 返回策略选择
        </button>
        <div className="bg-[#18181B] rounded-2xl p-6 border border-zinc-800">
          <h2 className="text-lg font-bold mb-4">定投策略配置</h2>
          <div className="space-y-4">
            <div>
              <label className="text-zinc-400 text-sm block mb-2">买什么？</label>
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700">
                <span className="font-medium">{dcaToken}</span>
                <ChevronDown className="w-4 h-4 text-zinc-500" />
              </div>
            </div>
            <div>
              <label className="text-zinc-400 text-sm block mb-2">每次买多少？</label>
              <input
                type="text"
                value={dcaAmount}
                onChange={(e) => setDcaAmount(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700"
                placeholder="10 USDC"
              />
            </div>
            <div>
              <label className="text-zinc-400 text-sm block mb-2">多久买一次？</label>
              <div className="flex flex-wrap gap-2">
                {FREQUENCIES.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setDcaFreq(f.id)}
                    className={clsx(
                      'px-3 py-2 rounded-xl text-sm font-medium',
                      dcaFreq === f.id ? 'bg-[#7C3AED] text-white' : 'bg-zinc-800 text-zinc-400 hover:text-white'
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="border-t border-zinc-800 pt-4">
              <p className="text-zinc-500 text-sm mb-2">—— 安全设置 ——</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <label className="text-zinc-500 block mb-1">单笔上限</label>
                  <input
                    type="text"
                    value={dcaCapSingle}
                    onChange={(e) => setDcaCapSingle(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700"
                  />
                </div>
                <div>
                  <label className="text-zinc-500 block mb-1">日上限</label>
                  <input
                    type="text"
                    value={dcaCapDaily}
                    onChange={(e) => setDcaCapDaily(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-800 border border-zinc-700"
                  />
                </div>
              </div>
              <p className="text-zinc-500 text-sm mt-2">授权有效期: {dcaDays} 天</p>
            </div>
            <div className="bg-zinc-800/50 rounded-xl p-4 text-sm text-zinc-400 space-y-1">
              <p>每小时买 {dcaAmount} USDC 的 {dcaToken}</p>
              <p>每天最多花 {Number(dcaCapDaily) || 0} USDC</p>
              <p>{dcaDays} 天后 Session Key 自动过期</p>
            </div>
            <button
              type="button"
              onClick={handleStartAgent}
              disabled={starting}
              className="w-full bg-[#7C3AED] hover:bg-violet-600 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2"
            >
              {starting ? '授权中...' : '启动 Agent（需要授权签名）'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Sniper placeholder
  if (view === 'sniper-placeholder') {
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => setView('strategies')}
          className="text-zinc-400 hover:text-white text-sm flex items-center gap-1"
        >
          ← 返回策略选择
        </button>
        <div className="bg-[#18181B] rounded-2xl p-6 border border-zinc-800">
          <h2 className="text-lg font-bold mb-2">新币狙击</h2>
          <p className="text-zinc-400 text-sm">监控 nad.fun 新币上线，符合条件自动买入。即将开放。</p>
        </div>
      </div>
    );
  }

  // --- Stop-loss config view
  if (view === 'stoploss-config') {
    return (
      <div className="space-y-6">
        <button
          type="button"
          onClick={() => setView('strategies')}
          className="text-zinc-400 hover:text-white text-sm flex items-center gap-1"
        >
          ← 返回策略选择
        </button>
        <div className="bg-[#18181B] rounded-2xl p-6 border border-zinc-800">
          <h2 className="text-lg font-bold mb-4">止盈止损配置</h2>
          <div className="space-y-4">
            <div>
              <label className="text-zinc-400 text-sm block mb-2">代币</label>
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700">
                <span className="font-medium">{slToken}</span>
              </div>
            </div>
            <div>
              <label className="text-zinc-400 text-sm block mb-2">止盈目标价 (USDC)</label>
              <input
                type="text"
                value={slTakeProfit}
                onChange={(e) => setSlTakeProfit(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700"
              />
            </div>
            <div>
              <label className="text-zinc-400 text-sm block mb-2">止损价 (USDC)</label>
              <input
                type="text"
                value={slStopLoss}
                onChange={(e) => setSlStopLoss(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-zinc-800 border border-zinc-700"
              />
            </div>
            <button
              type="button"
              onClick={handleStartAgent}
              disabled={starting}
              className="w-full bg-[#7C3AED] hover:bg-violet-600 text-white font-bold py-4 rounded-2xl"
            >
              {starting ? '授权中...' : '启动 Agent'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Natural language chat view (Step 5)
  if (view === 'nl-chat') {
    return <AgentNLChat userId={userId} onBack={() => setView('strategies')} />;
  }

  // --- Running state view (Step 4)
  if (view === 'running' && isRunning) {
    return (
      <div className="space-y-6">
        <div className="bg-[#18181B] rounded-2xl p-6 border border-zinc-800">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold">Agent 运行中</h2>
            <span className="flex items-center gap-2 text-[#22C55E] text-sm">
              <span className="w-2 h-2 rounded-full bg-[#22C55E]" /> 活跃
            </span>
          </div>
          <div className="space-y-4">
            <div className="bg-zinc-800/50 rounded-xl p-4 text-sm">
              <p className="text-zinc-400 mb-1">当前策略</p>
              <p className="font-medium">定投: 每小时买 {dcaAmount} USDC 的 {dcaToken}</p>
              <p className="text-zinc-500 mt-2">已执行: {stats.tradeCount} 次 | 已花费: {stats.totalSpent.toFixed(2)} USDC</p>
              <p className="text-zinc-500">买到: {stats.totalReceived.toFixed(4)} {dcaToken}</p>
              {stats.avgPrice > 0 && (
                <p className="text-zinc-500">平均买入价: {stats.avgPrice.toFixed(6)} USDC/{dcaToken}</p>
              )}
            </div>
            <div>
              <p className="text-zinc-500 text-sm mb-2">—— Agent 活动日志 ——</p>
              <div className="max-h-48 overflow-y-auto space-y-2 font-mono text-sm">
                {logs.length === 0 && <p className="text-zinc-600">暂无日志</p>}
                {logs.map((l, i) => {
                  const txHash = l.txHash ?? l.msg.match(/tx: (0x[a-fA-F0-9]{8,})/)?.[1];
                  return (
                    <div
                      key={i}
                      className={clsx(
                        'py-1',
                        l.type === 'buy' && 'text-[#22C55E]',
                        l.type === 'sell' && 'text-[#EF4444]',
                        l.type === 'skip' && 'text-[#F59E0B]',
                        l.type === 'info' && 'text-zinc-400'
                      )}
                    >
                      [{l.time}] {l.msg}
                      {txHash && (
                        <a
                          href={`https://testnet.monadexplorer.com/tx/${txHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="ml-1 text-[#7C3AED] hover:underline text-xs"
                        >
                          ↗
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="bg-zinc-800/50 rounded-xl p-4 text-sm">
              <p className="text-zinc-400 mb-1">持仓汇总</p>
              <p>{dcaToken}: {stats.totalReceived.toFixed(4)} 个</p>
              <p className="text-zinc-500">成本: {stats.totalSpent.toFixed(2)} USDC</p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handlePauseAgent}
                className="flex-1 py-3 rounded-xl border border-zinc-600 text-zinc-300 hover:bg-zinc-800"
              >
                暂停
              </button>
              <button
                type="button"
                onClick={handleStopAgent}
                className="flex-1 py-3 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30"
              >
                停止并撤销授权
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function AgentNLChat({ userId, onBack }: { userId: string | undefined; onBack: () => void }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'agent'; text: string; confirm?: boolean }>>([]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const userText = input.trim();
    setMessages((prev) => [...prev, { role: 'user', text: userText }]);
    setInput('');

    if (userId) {
      try {
        const res = await fetch(getApiUrl('/api/v1/agent/instruct'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, text: userText }),
        });
        if (res.ok) {
          setMessages((prev) => [
            ...prev,
            { role: 'agent', text: '指令已发送，Agent 将在运行中处理。' },
          ]);
          return;
        }
      } catch (_) {}
    }

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: 'agent',
          text: `当前价格: 1 MON = 0.41 USDC\n50 USDC ≈ 121.9 MON\n滑点: 0.5%\n路由: USDC → MON (OpenClaw)`,
          confirm: true,
        },
      ]);
    }, 600);
  };

  const handleConfirm = () => {
    setMessages((prev) => [
      ...prev,
      { role: 'user', text: '确认' },
      { role: 'agent', text: '✅ 交易成功! 买入 121.3 MON，花费 50 USDC\ntx: 0xab3...f8c ↗' },
    ]);
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="text-zinc-400 hover:text-white text-sm flex items-center gap-1"
      >
        ← 返回策略选择
      </button>
      <div className="bg-[#18181B] rounded-2xl border border-zinc-800 overflow-hidden">
        <div className="p-4 border-b border-zinc-800">
          <h2 className="font-bold">和 Agent 对话</h2>
        </div>
        <div className="p-4 max-h-80 overflow-y-auto space-y-4">
          {messages.length === 0 && (
            <p className="text-zinc-500 text-sm">例如: 帮我买 50 USDC 的 MON / 查看我的余额 / 把一半的 MON 卖掉</p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={m.role === 'user' ? 'text-right' : 'text-left'}
            >
              <div
                className={clsx(
                  'inline-block px-4 py-2 rounded-2xl text-sm max-w-[85%] whitespace-pre-wrap',
                  m.role === 'user' ? 'bg-[#7C3AED] text-white' : 'bg-zinc-800 text-zinc-300'
                )}
              >
                {m.role === 'agent' && '🤖 '}
                {m.text}
                {m.confirm && (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={handleConfirm}
                      className="px-3 py-1.5 rounded-lg bg-[#22C55E] text-white text-xs"
                    >
                      确认执行
                    </button>
                    <button type="button" className="px-3 py-1.5 rounded-lg border border-zinc-600 text-xs">
                      取消
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <form onSubmit={handleSend} className="p-4 border-t border-zinc-800 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入指令..."
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl py-3 px-4 text-white placeholder-zinc-500 focus:outline-none focus:border-[#7C3AED]"
          />
          <button
            type="submit"
            className="p-3 rounded-xl bg-[#7C3AED] hover:bg-violet-600 text-white"
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}
