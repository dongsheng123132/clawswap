'use client';

import { useState } from 'react';
import { useAccount, useWriteContract } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ArrowDown, Settings } from 'lucide-react';
import { useQuote } from '@/hooks/useQuote';
import clsx from 'clsx';

export default function SwapPage() {
  const { isConnected } = useAccount();
  const [amountIn, setAmountIn] = useState('');
  const [tokenIn, setTokenIn] = useState('USDC');
  const [tokenOut, setTokenOut] = useState('MON');
  
  const { quote, loading: quoteLoading } = useQuote(tokenIn, tokenOut, amountIn);

  const handleSwap = () => {
    // Execute swap logic
    console.log("Swapping", amountIn, tokenIn, "for", quote?.amountOut, tokenOut);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-4">
      <div className="w-full max-w-md bg-zinc-900 rounded-3xl p-4 border border-zinc-800">
        <div className="flex justify-between items-center mb-4 px-2">
          <span className="font-medium text-zinc-400">Swap</span>
          <Settings className="w-5 h-5 text-zinc-400 cursor-pointer hover:text-white" />
        </div>

        {/* Input Token */}
        <div className="bg-zinc-800 rounded-2xl p-4 mb-1 hover:bg-zinc-700/50 transition-colors">
          <div className="flex justify-between mb-2">
            <span className="text-zinc-400 text-sm">You pay</span>
            <span className="text-zinc-400 text-sm">Balance: 0</span>
          </div>
          <div className="flex justify-between items-center">
            <input
              type="number"
              value={amountIn}
              onChange={(e) => setAmountIn(e.target.value)}
              placeholder="0"
              className="bg-transparent text-4xl font-medium outline-none w-full placeholder-zinc-600"
            />
            <button className="bg-black/20 hover:bg-black/30 rounded-full px-3 py-1 flex items-center gap-2 shrink-0">
              <span className="font-bold text-xl">{tokenIn}</span>
            </button>
          </div>
        </div>

        {/* Switch Button */}
        <div className="flex justify-center -my-3 relative z-10">
          <div className="bg-zinc-900 p-1 rounded-xl border-4 border-black">
             <div className="bg-zinc-800 p-2 rounded-lg cursor-pointer hover:bg-zinc-700">
               <ArrowDown className="w-4 h-4 text-zinc-400" />
             </div>
          </div>
        </div>

        {/* Output Token */}
        <div className="bg-zinc-800 rounded-2xl p-4 mt-1 hover:bg-zinc-700/50 transition-colors">
          <div className="flex justify-between mb-2">
            <span className="text-zinc-400 text-sm">You receive</span>
            <span className="text-zinc-400 text-sm">Balance: 0</span>
          </div>
          <div className="flex justify-between items-center">
            <input
              type="text"
              readOnly
              value={quoteLoading ? 'Loading...' : (quote?.amountOut || '')}
              placeholder="0"
              className={clsx(
                "bg-transparent text-4xl font-medium outline-none w-full placeholder-zinc-600",
                quoteLoading && "text-zinc-500 animate-pulse"
              )}
            />
            <button className="bg-black/20 hover:bg-black/30 rounded-full px-3 py-1 flex items-center gap-2 shrink-0">
              <span className="font-bold text-xl">{tokenOut}</span>
            </button>
          </div>
        </div>

        {/* Info */}
        {quote && (
          <div className="mt-4 px-2 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Price Impact</span>
              <span className="text-green-500">~{quote.priceImpact}%</span>
            </div>
             <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Network Cost</span>
              <span className="text-zinc-400">~$0.01</span>
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="mt-4">
          {!isConnected ? (
            <ConnectButton.Custom>
              {({ openConnectModal }) => (
                <button
                  onClick={openConnectModal}
                  className="w-full bg-[#4C3D98] hover:bg-[#5C4DA8] text-white font-bold py-4 rounded-2xl text-xl transition-all"
                >
                  Connect Wallet
                </button>
              )}
            </ConnectButton.Custom>
          ) : (
            <button
              onClick={handleSwap}
              disabled={!quote || quoteLoading}
              className="w-full bg-[#4C3D98] hover:bg-[#5C4DA8] disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-bold py-4 rounded-2xl text-xl transition-all"
            >
              {quoteLoading ? 'Fetching Price...' : 'Swap'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
