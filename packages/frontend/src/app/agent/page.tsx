'use client';

import { useState } from 'react';
import { useSmartWallet } from '@/hooks/useSmartWallet';
import { Play, Pause, Send, Activity, Wallet, History } from 'lucide-react';
import clsx from 'clsx';

export default function AgentDashboard() {
  const { address, loading, authorizeAgent, revokeAgent } = useSmartWallet();
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [input, setInput] = useState('');

  const toggleAgent = async () => {
    if (isRunning) {
      await revokeAgent();
      setIsRunning(false);
      addLog('Agent stopped.');
    } else {
      const success = await authorizeAgent();
      if (success) {
        setIsRunning(true);
        addLog('Agent started. Monitoring market conditions...');
      }
    }
  };

  const addLog = (msg: string) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev]);
  };

  const handleCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    
    addLog(`User: ${input}`);
    // Simulate Agent response
    setTimeout(() => {
        addLog(`Agent: Processing instruction "${input}"...`);
        if (input.includes('buy')) {
            addLog(`Agent: Identified intent: SWAP. Fetching quotes...`);
            setTimeout(() => addLog(`Agent: Executed SWAP: 100 USDC -> 99.8 MON`), 1000);
        }
    }, 500);
    
    setInput('');
  };

  return (
    <div className="flex h-screen bg-black text-white overflow-hidden">
      {/* Sidebar / Status */}
      <div className="w-80 border-r border-zinc-800 p-6 flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center">
            <Activity className="text-white" />
          </div>
          <h1 className="text-xl font-bold">OpenClaw Agent</h1>
        </div>

        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
          <div className="flex justify-between items-center mb-4">
            <span className="text-zinc-400">Status</span>
            <div className={clsx("flex items-center gap-2 px-2 py-1 rounded-full text-xs font-medium", isRunning ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400")}>
              <div className={clsx("w-2 h-2 rounded-full", isRunning ? "bg-green-500" : "bg-red-500")} />
              {isRunning ? 'RUNNING' : 'STOPPED'}
            </div>
          </div>
          
          <button
            onClick={toggleAgent}
            className={clsx(
              "w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all",
              isRunning 
                ? "bg-red-500/10 text-red-400 hover:bg-red-500/20" 
                : "bg-green-500 text-black hover:bg-green-400"
            )}
          >
            {isRunning ? <><Pause size={18} /> Stop Agent</> : <><Play size={18} /> Start Agent</>}
          </button>
        </div>

        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
          <div className="flex items-center gap-2 mb-3 text-zinc-400">
            <Wallet size={16} />
            <span className="text-sm font-medium">Smart Wallet</span>
          </div>
          <div className="text-2xl font-bold mb-1">$1,240.50</div>
          <div className="text-xs text-zinc-500 break-all font-mono">
            {address || 'Not Connected'}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Strategy Panel (Top) */}
        <div className="flex-1 p-6 overflow-y-auto border-b border-zinc-800">
          <h2 className="text-lg font-bold mb-4">Active Strategies</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800 hover:border-purple-500/50 transition-colors">
              <div className="flex justify-between mb-2">
                <h3 className="font-medium">DCA (Dollar Cost Average)</h3>
                <span className="text-green-400 text-xs bg-green-500/10 px-2 py-1 rounded">Active</span>
              </div>
              <p className="text-zinc-400 text-sm mb-4">Buy $50 MON every day at 10:00 AM</p>
              <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                <div className="bg-purple-500 h-full w-2/3" />
              </div>
            </div>
            
            <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800 opacity-60">
               <div className="flex justify-between mb-2">
                <h3 className="font-medium">Stop Loss</h3>
                <span className="text-zinc-500 text-xs bg-zinc-800 px-2 py-1 rounded">Inactive</span>
              </div>
              <p className="text-zinc-400 text-sm mb-4">Sell MON if price drops below $0.50</p>
            </div>
          </div>
        </div>

        {/* Logs & Chat (Bottom) */}
        <div className="h-1/2 flex flex-col bg-zinc-950">
          {/* Logs */}
          <div className="flex-1 p-4 overflow-y-auto font-mono text-sm space-y-1">
            <div className="flex items-center gap-2 text-zinc-500 mb-2 sticky top-0 bg-zinc-950 py-1">
              <History size={14} />
              <span>Activity Log</span>
            </div>
            {logs.length === 0 && <div className="text-zinc-600 italic">No activity yet.</div>}
            {logs.map((log, i) => (
              <div key={i} className={clsx(
                "py-1 border-b border-zinc-900/50",
                log.includes('User:') ? "text-blue-400" : 
                log.includes('Agent:') ? "text-purple-400" : "text-zinc-300"
              )}>
                {log}
              </div>
            ))}
          </div>

          {/* Input */}
          <form onSubmit={handleCommand} className="p-4 border-t border-zinc-800 bg-zinc-900">
            <div className="relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask Agent to do something (e.g., 'Buy 100 MON')..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-4 pl-5 pr-12 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition-colors"
              />
              <button
                type="submit"
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-white transition-colors"
              >
                <Send size={18} />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
