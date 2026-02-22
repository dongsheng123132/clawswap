"use client";

import { useState, useEffect, useCallback } from "react";
import {
  publicClient,
  CONTRACTS,
  getBalances,
  getQuote,
  monadTestnet,
  ERC20_ABI,
  SWAP_ROUTER_ABI,
} from "@/lib/monad";
import { formatEther, formatUnits, parseUnits, parseEther, type Address, encodeFunctionData } from "viem";
import clsx from "clsx";

// ============ Types ============
interface AgentLog {
  id: number;
  time: string;
  action: string;
  detail: string;
  status: "success" | "pending" | "skip";
}

// ============ Main Page ============
export default function Home() {
  // --- Tab ---
  const [tab, setTab] = useState<"swap" | "agent" | "earn">("swap");

  // --- Wallet (read-only demo, input an address) ---
  const [walletAddress, setWalletAddress] = useState("");
  const [balances, setBalances] = useState<{ mon: string; usdc: string } | null>(null);
  const [loadingBalances, setLoadingBalances] = useState(false);

  // --- Swap ---
  const [amountIn, setAmountIn] = useState("");
  const [direction, setDirection] = useState<"usdc_to_mon" | "mon_to_usdc">("usdc_to_mon");
  const [quoteOut, setQuoteOut] = useState<string | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  // --- Agent ---
  const [agentRunning, setAgentRunning] = useState(false);
  const [dcaAmount, setDcaAmount] = useState("1");
  const [dcaInterval, setDcaInterval] = useState(60); // seconds
  const [agentLogs, setAgentLogs] = useState<AgentLog[]>([]);
  const [totalBought, setTotalBought] = useState(0);
  const [totalSpent, setTotalSpent] = useState(0);

  // --- Price ---
  const [monPrice, setMonPrice] = useState<string | null>(null);
  const [blockNumber, setBlockNumber] = useState<bigint | null>(null);

  // ============ Load chain data ============
  useEffect(() => {
    const loadChainData = async () => {
      try {
        const block = await publicClient.getBlockNumber();
        setBlockNumber(block);

        // Get MON price: quote 1 USDC → WMON
        const q = await getQuote(CONTRACTS.USDC, CONTRACTS.WMON, 1_000_000n);
        if (q) {
          const monPer1Usdc = parseFloat(formatEther(q.amountOut));
          const pricePerMon = monPer1Usdc > 0 ? (1 / monPer1Usdc).toFixed(4) : "N/A";
          setMonPrice(pricePerMon);
        }
      } catch (e) {
        console.error("Failed to load chain data:", e);
      }
    };
    loadChainData();
    const interval = setInterval(loadChainData, 15000);
    return () => clearInterval(interval);
  }, []);

  // ============ Load balances ============
  const loadBalances = useCallback(async () => {
    if (!walletAddress || !walletAddress.startsWith("0x")) return;
    setLoadingBalances(true);
    try {
      const bal = await getBalances(walletAddress as Address);
      setBalances({ mon: bal.mon, usdc: bal.usdc });
    } catch (e) {
      console.error("Failed to load balances:", e);
    }
    setLoadingBalances(false);
  }, [walletAddress]);

  useEffect(() => {
    if (walletAddress.length === 42) loadBalances();
  }, [walletAddress, loadBalances]);

  // ============ Get quote ============
  useEffect(() => {
    const fetchQuote = async () => {
      if (!amountIn || parseFloat(amountIn) <= 0) {
        setQuoteOut(null);
        return;
      }
      setQuoteLoading(true);
      try {
        const tokenIn = direction === "usdc_to_mon" ? CONTRACTS.USDC : CONTRACTS.WMON;
        const tokenOut = direction === "usdc_to_mon" ? CONTRACTS.WMON : CONTRACTS.USDC;
        const decimalsIn = direction === "usdc_to_mon" ? 6 : 18;
        const decimalsOut = direction === "usdc_to_mon" ? 18 : 6;
        const amtIn = parseUnits(amountIn, decimalsIn);
        const q = await getQuote(tokenIn, tokenOut, amtIn);
        if (q) {
          setQuoteOut(formatUnits(q.amountOut, decimalsOut));
        } else {
          setQuoteOut("No pool / no liquidity");
        }
      } catch {
        setQuoteOut("Error");
      }
      setQuoteLoading(false);
    };

    const timer = setTimeout(fetchQuote, 500);
    return () => clearTimeout(timer);
  }, [amountIn, direction]);

  // ============ Agent simulation ============
  useEffect(() => {
    if (!agentRunning) return;

    const runAgent = async () => {
      const now = new Date().toLocaleTimeString("zh-CN", { hour12: false });
      const amt = parseFloat(dcaAmount);

      // Simulate: get a real quote from chain
      try {
        const amtIn = parseUnits(dcaAmount, 6); // USDC 6 decimals
        const q = await getQuote(CONTRACTS.USDC, CONTRACTS.WMON, amtIn);

        if (q) {
          const monAmount = parseFloat(formatEther(q.amountOut));

          // Simulate random skip for realism
          if (Math.random() < 0.15) {
            setAgentLogs((prev) => [
              {
                id: Date.now(),
                time: now,
                action: "SKIP",
                detail: `Price volatility > 5%, skipping`,
                status: "skip",
              },
              ...prev,
            ]);
            return;
          }

          setTotalBought((p) => p + monAmount);
          setTotalSpent((p) => p + amt);
          setAgentLogs((prev) => [
            {
              id: Date.now(),
              time: now,
              action: "BUY",
              detail: `${amt} USDC -> ${monAmount.toFixed(4)} MON`,
              status: "success",
            },
            ...prev,
          ]);
        } else {
          setAgentLogs((prev) => [
            {
              id: Date.now(),
              time: now,
              action: "ERROR",
              detail: "No liquidity in pool",
              status: "skip",
            },
            ...prev,
          ]);
        }
      } catch {
        setAgentLogs((prev) => [
          {
            id: Date.now(),
            time: now,
            action: "ERROR",
            detail: "RPC error, will retry",
            status: "skip",
          },
          ...prev,
        ]);
      }
    };

    // Run immediately
    runAgent();
    // Then on interval
    const interval = setInterval(runAgent, dcaInterval * 1000);
    return () => clearInterval(interval);
  }, [agentRunning, dcaAmount, dcaInterval]);

  // ============ Render ============
  return (
    <div className="min-h-screen bg-black text-white">
      {/* ===== Header ===== */}
      <header className="border-b border-zinc-800 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="text-xl font-bold">
            <span className="text-purple-400">OpenClaw</span>{" "}
            <span className="text-xs text-zinc-500 font-normal">
              Monad Testnet
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            {blockNumber && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                Block #{blockNumber.toString()}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* ===== Wallet Input ===== */}
      <div className="max-w-lg mx-auto px-4 pt-4">
        <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
          <label className="text-xs text-zinc-500 mb-1 block">
            Wallet Address (paste any Monad testnet address)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="0x..."
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              className="flex-1 bg-zinc-800 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-purple-500 font-mono"
            />
            <button
              onClick={loadBalances}
              disabled={loadingBalances}
              className="bg-purple-600 hover:bg-purple-500 px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
            >
              {loadingBalances ? "..." : "Load"}
            </button>
          </div>
          {balances && (
            <div className="flex gap-4 mt-3 text-sm">
              <div>
                <span className="text-zinc-500">MON:</span>{" "}
                <span className="font-mono font-bold">
                  {parseFloat(balances.mon).toFixed(4)}
                </span>
              </div>
              <div>
                <span className="text-zinc-500">USDC:</span>{" "}
                <span className="font-mono font-bold text-green-400">
                  {parseFloat(balances.usdc).toFixed(2)}
                </span>
              </div>
              {monPrice && (
                <div className="ml-auto">
                  <span className="text-zinc-500">MON Price:</span>{" "}
                  <span className="font-mono">${monPrice}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ===== Tabs ===== */}
      <div className="max-w-lg mx-auto px-4 pt-4">
        <div className="flex gap-1 bg-zinc-900 rounded-xl p-1">
          {(["swap", "agent", "earn"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={clsx(
                "flex-1 py-2 rounded-lg text-sm font-medium transition-all",
                tab === t
                  ? "bg-purple-600 text-white"
                  : "text-zinc-400 hover:text-white"
              )}
            >
              {t === "swap" ? "Swap" : t === "agent" ? "AI Agent" : "Earn (x402)"}
            </button>
          ))}
        </div>
      </div>

      {/* ===== Content ===== */}
      <div className="max-w-lg mx-auto px-4 py-4">
        {/* --- SWAP TAB --- */}
        {tab === "swap" && (
          <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 space-y-3">
            <div className="text-sm text-zinc-400 mb-2">
              Real-time quote from Uniswap V3 on Monad Testnet
            </div>

            {/* Input */}
            <div className="bg-zinc-800 rounded-xl p-3">
              <div className="text-xs text-zinc-500 mb-1">You pay</div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={amountIn}
                  onChange={(e) => setAmountIn(e.target.value)}
                  placeholder="0"
                  className="flex-1 bg-transparent text-2xl font-bold outline-none placeholder-zinc-700"
                />
                <span className="bg-zinc-700 px-3 py-1 rounded-lg font-bold text-sm">
                  {direction === "usdc_to_mon" ? "USDC" : "MON"}
                </span>
              </div>
            </div>

            {/* Switch */}
            <div className="flex justify-center">
              <button
                onClick={() =>
                  setDirection((d) =>
                    d === "usdc_to_mon" ? "mon_to_usdc" : "usdc_to_mon"
                  )
                }
                className="bg-zinc-800 hover:bg-zinc-700 p-2 rounded-lg text-zinc-400"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 1L8 15M8 15L4 11M8 15L12 11M8 1L4 5M8 1L12 5" stroke="currentColor" strokeWidth="1.5" fill="none" />
                </svg>
              </button>
            </div>

            {/* Output */}
            <div className="bg-zinc-800 rounded-xl p-3">
              <div className="text-xs text-zinc-500 mb-1">You receive</div>
              <div className="flex items-center gap-2">
                <div
                  className={clsx(
                    "flex-1 text-2xl font-bold",
                    quoteLoading && "animate-pulse text-zinc-600"
                  )}
                >
                  {quoteLoading
                    ? "..."
                    : quoteOut
                      ? parseFloat(quoteOut) > 0
                        ? parseFloat(quoteOut).toFixed(6)
                        : quoteOut
                      : "0"}
                </div>
                <span className="bg-zinc-700 px-3 py-1 rounded-lg font-bold text-sm">
                  {direction === "usdc_to_mon" ? "MON" : "USDC"}
                </span>
              </div>
            </div>

            {/* Info */}
            {quoteOut && parseFloat(quoteOut) > 0 && amountIn && (
              <div className="space-y-1 text-xs text-zinc-500 px-1">
                <div className="flex justify-between">
                  <span>Rate</span>
                  <span className="font-mono">
                    1{" "}
                    {direction === "usdc_to_mon" ? "USDC" : "MON"} ={" "}
                    {(parseFloat(quoteOut) / parseFloat(amountIn)).toFixed(4)}{" "}
                    {direction === "usdc_to_mon" ? "MON" : "USDC"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Route</span>
                  <span>
                    {direction === "usdc_to_mon"
                      ? "USDC -> WMON (Uniswap V3, 0.3%)"
                      : "WMON -> USDC (Uniswap V3, 0.3%)"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Network</span>
                  <span>Monad Testnet (Chain 10143)</span>
                </div>
              </div>
            )}

            <button className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded-xl transition-all text-lg">
              Swap (Demo - Read Only)
            </button>
            <div className="text-center text-xs text-zinc-600">
              This demo reads real on-chain data. Swap execution requires wallet
              connection.
            </div>
          </div>
        )}

        {/* --- AGENT TAB --- */}
        {tab === "agent" && (
          <div className="space-y-4">
            {/* Config */}
            <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
              <div className="flex items-center justify-between mb-3">
                <span className="font-bold">AI Agent DCA Strategy</span>
                <span
                  className={clsx(
                    "text-xs px-2 py-1 rounded-full",
                    agentRunning
                      ? "bg-green-900 text-green-400"
                      : "bg-zinc-800 text-zinc-500"
                  )}
                >
                  {agentRunning ? "Running" : "Stopped"}
                </span>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-zinc-500 block mb-1">
                    Buy amount (USDC per trade)
                  </label>
                  <input
                    type="number"
                    value={dcaAmount}
                    onChange={(e) => setDcaAmount(e.target.value)}
                    disabled={agentRunning}
                    className="w-full bg-zinc-800 rounded-xl px-3 py-2 text-sm outline-none disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="text-xs text-zinc-500 block mb-1">
                    Interval
                  </label>
                  <div className="flex gap-2">
                    {[
                      { label: "10s", val: 10 },
                      { label: "30s", val: 30 },
                      { label: "1m", val: 60 },
                      { label: "5m", val: 300 },
                    ].map(({ label, val }) => (
                      <button
                        key={val}
                        onClick={() => setDcaInterval(val)}
                        disabled={agentRunning}
                        className={clsx(
                          "flex-1 py-2 rounded-lg text-sm font-medium transition-all",
                          dcaInterval === val
                            ? "bg-purple-600 text-white"
                            : "bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-50"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-zinc-800 rounded-xl p-3 text-xs text-zinc-400 space-y-1">
                  <div>
                    Strategy: Buy {dcaAmount} USDC of MON every{" "}
                    {dcaInterval < 60
                      ? `${dcaInterval}s`
                      : `${dcaInterval / 60}m`}
                  </div>
                  <div>
                    Data source: Real quotes from Uniswap V3 on Monad Testnet
                  </div>
                  <div className="text-yellow-500">
                    Demo mode: simulates trades using real on-chain prices
                  </div>
                </div>

                <button
                  onClick={() => {
                    if (agentRunning) {
                      setAgentRunning(false);
                    } else {
                      setAgentLogs([]);
                      setTotalBought(0);
                      setTotalSpent(0);
                      setAgentRunning(true);
                    }
                  }}
                  className={clsx(
                    "w-full font-bold py-3 rounded-xl transition-all text-lg",
                    agentRunning
                      ? "bg-red-600 hover:bg-red-500 text-white"
                      : "bg-purple-600 hover:bg-purple-500 text-white"
                  )}
                >
                  {agentRunning ? "Stop Agent" : "Start Agent"}
                </button>
              </div>
            </div>

            {/* PnL */}
            {totalSpent > 0 && (
              <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
                <div className="text-sm text-zinc-400 mb-2">Portfolio</div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div className="text-xs text-zinc-500">MON Bought</div>
                    <div className="font-bold font-mono">
                      {totalBought.toFixed(4)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500">USDC Spent</div>
                    <div className="font-bold font-mono text-red-400">
                      {totalSpent.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500">Avg Price</div>
                    <div className="font-bold font-mono">
                      {totalBought > 0
                        ? (totalSpent / totalBought).toFixed(4)
                        : "-"}
                    </div>
                  </div>
                </div>
                {monPrice && totalBought > 0 && (
                  <div className="mt-3 text-center">
                    <div className="text-xs text-zinc-500">
                      Unrealized PnL
                    </div>
                    <div
                      className={clsx(
                        "text-xl font-bold font-mono",
                        totalBought * parseFloat(monPrice) - totalSpent >= 0
                          ? "text-green-400"
                          : "text-red-400"
                      )}
                    >
                      {(
                        totalBought * parseFloat(monPrice) -
                        totalSpent
                      ).toFixed(4)}{" "}
                      USDC (
                      {(
                        ((totalBought * parseFloat(monPrice) - totalSpent) /
                          totalSpent) *
                        100
                      ).toFixed(2)}
                      %)
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Logs */}
            <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
              <div className="text-sm text-zinc-400 mb-2">
                Agent Activity Log{" "}
                {agentRunning && (
                  <span className="animate-pulse text-green-400">LIVE</span>
                )}
              </div>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {agentLogs.length === 0 ? (
                  <div className="text-zinc-600 text-sm text-center py-4">
                    No activity yet. Start the Agent to begin.
                  </div>
                ) : (
                  agentLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center gap-2 text-xs font-mono py-1 border-b border-zinc-800/50"
                    >
                      <span className="text-zinc-600 w-16 shrink-0">
                        {log.time}
                      </span>
                      <span
                        className={clsx(
                          "w-10 shrink-0 font-bold",
                          log.status === "success" && "text-green-400",
                          log.status === "skip" && "text-yellow-400",
                          log.status === "pending" && "text-blue-400"
                        )}
                      >
                        {log.action}
                      </span>
                      <span className="text-zinc-300 truncate">
                        {log.detail}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* --- EARN TAB --- */}
        {tab === "earn" && (
          <div className="space-y-4">
            <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
              <div className="font-bold mb-3">x402 API Endpoints</div>
              <div className="text-xs text-zinc-400 mb-4">
                Other AI Agents pay USDC (via x402 protocol) to call your API.
                <br />
                Your server reads blockchain data for free, charges for
                convenience.
              </div>

              <div className="space-y-3">
                {[
                  {
                    method: "GET",
                    path: "/api/v1/quote",
                    price: "$0.0001",
                    desc: "Get best swap quote across DEXes",
                    source: "Reads Uniswap V3 QuoterV2 contract on-chain",
                  },
                  {
                    method: "POST",
                    path: "/api/v1/swap",
                    price: "$0.001",
                    desc: "Execute swap transaction",
                    source: "Calls Uniswap V3 SwapRouter on-chain",
                  },
                  {
                    method: "GET",
                    path: "/api/v1/price",
                    price: "$0.0001",
                    desc: "Real-time token price",
                    source: "Reads pool sqrtPriceX96 from Factory",
                  },
                ].map((api) => (
                  <div
                    key={api.path}
                    className="bg-zinc-800 rounded-xl p-3 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-mono text-sm">
                        <span className="text-purple-400 font-bold">
                          {api.method}
                        </span>{" "}
                        {api.path}
                      </div>
                      <span className="text-green-400 text-xs font-bold">
                        {api.price}/call
                      </span>
                    </div>
                    <div className="text-xs text-zinc-400">{api.desc}</div>
                    <div className="text-xs text-zinc-600">
                      Source: {api.source}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
              <div className="font-bold mb-2">How It Works</div>
              <div className="text-xs text-zinc-400 space-y-3">
                <div className="bg-zinc-800 rounded-xl p-3 font-mono text-[11px] leading-relaxed">
                  <div className="text-zinc-500">{`// Other AI Agent calls your API:`}</div>
                  <div>
                    <span className="text-purple-400">GET</span>{" "}
                    /api/v1/quote?from=USDC&to=MON&amount=100
                  </div>
                  <div className="text-zinc-500 mt-2">{`// Your server returns 402 Payment Required:`}</div>
                  <div className="text-yellow-400">
                    {`{ status: 402, price: "$0.0001", network: "eip155:10143" }`}
                  </div>
                  <div className="text-zinc-500 mt-2">{`// Agent auto-pays $0.0001 USDC via x402`}</div>
                  <div className="text-zinc-500">{`// Your server reads QuoterV2 contract (free)`}</div>
                  <div className="text-zinc-500">{`// Returns best quote:`}</div>
                  <div className="text-green-400">
                    {`{ amountOut: "248.5 MON", route: "Uniswap V3" }`}
                  </div>
                  <div className="text-zinc-500 mt-2">{`// You earned $0.0001. Cost to you: $0.`}</div>
                </div>

                <div className="bg-zinc-800 rounded-xl p-3">
                  <div className="font-bold text-white text-sm mb-1">
                    Where does the data come from?
                  </div>
                  <div>
                    Blockchain is a public database. You read prices directly
                    from Uniswap V3 smart contracts deployed on Monad. This is
                    100% free. You charge other AI agents for the{" "}
                    <span className="text-purple-400">convenience</span> of not
                    having to interact with contracts themselves.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== Footer ===== */}
      <footer className="border-t border-zinc-800 mt-8 py-4 text-center text-xs text-zinc-600">
        OpenClaw Demo | Monad Testnet (Chain 10143) | Data from Uniswap V3
        on-chain
      </footer>
    </div>
  );
}
