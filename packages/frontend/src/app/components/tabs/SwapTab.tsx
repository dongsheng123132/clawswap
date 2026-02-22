'use client';

import { useState, useEffect } from 'react';
import { ArrowDown, Settings, ChevronDown } from 'lucide-react';
import {
  parseUnits,
  parseAbi,
  encodeFunctionData,
  type Address,
} from 'viem';
import { useQuote } from '@/hooks/useQuote';
import { useBalances } from '@/hooks/useBalances';
import { useSmartWallet } from '@/hooks/useSmartWallet';
import { getApiUrl } from '@/lib/api';
import clsx from 'clsx';

const SWAP_ROUTER = '0xfe31f71c1b106eac32f1a19239c9a9a72ddfb900' as Address;
const WMON = '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A' as Address;
const USDC_ADDR = '0x534b2f3A21130d7a60830c2Df862319e593943A3' as Address;

const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
]);
const SWAP_ROUTER_ABI = parseAbi([
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)',
]);

function getTokenAddress(symbol: string): Address {
  return symbol.toUpperCase() === 'USDC' ? USDC_ADDR : WMON;
}
function getTokenDecimals(symbol: string): number {
  return symbol.toUpperCase() === 'USDC' ? 6 : 18;
}

const TOKENS = [
  { symbol: 'USDC', name: 'USD Coin' },
  { symbol: 'MON', name: 'Monad' },
];

function TokenButton({
  symbol,
  onClick,
}: {
  symbol: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-black/20 hover:bg-black/30 rounded-full px-3 py-1.5 flex items-center gap-2 shrink-0"
    >
      <span className="font-bold text-xl">{symbol}</span>
      <ChevronDown className="w-4 h-4 text-zinc-400" />
    </button>
  );
}

function TokenModal({
  onSelect,
  onClose,
  current,
}: {
  onSelect: (symbol: string) => void;
  onClose: () => void;
  current: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div
        className="bg-[#18181B] rounded-2xl border border-zinc-800 w-full max-w-sm p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <span className="font-medium text-zinc-300">选择代币</span>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-white">关闭</button>
        </div>
        <ul className="space-y-1">
          {TOKENS.filter((t) => t.symbol !== current).map((t) => (
            <li key={t.symbol}>
              <button
                type="button"
                onClick={() => { onSelect(t.symbol); onClose(); }}
                className="w-full text-left px-4 py-3 rounded-xl hover:bg-zinc-800 flex justify-between items-center"
              >
                <span className="font-medium">{t.symbol}</span>
                <span className="text-zinc-500 text-sm">{t.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const MOCK_RECENT_TRADES = [
  { id: '1', summary: '50 USDC → 124.2 MON', time: '2 分钟前', success: true },
  { id: '2', summary: '0.5 MON → 0.2 USDC', time: '1 小时前', success: true },
];

export default function SwapTab() {
  const [amountIn, setAmountIn] = useState('');
  const [tokenIn, setTokenIn] = useState('USDC');
  const [tokenOut, setTokenOut] = useState('MON');
  const [tokenModal, setTokenModal] = useState<'in' | 'out' | null>(null);
  const [swapToast, setSwapToast] = useState<'sending' | 'confirming' | 'done' | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const { quote, loading: quoteLoading } = useQuote(tokenIn, tokenOut, amountIn);
  const { mon, usdc, refresh: refreshBalances } = useBalances();
  const { kernelClient, smartAccount, address: walletAddress } = useSmartWallet();
  const balanceIn = tokenIn === 'USDC' ? usdc : mon;
  const balanceOut = tokenOut === 'USDC' ? usdc : mon;
  const insufficientBalance = amountIn && Number(amountIn) > balanceIn;

  useEffect(() => {
    refreshBalances();
  }, [refreshBalances]);

  const handleSwap = async () => {
    if (!kernelClient || !smartAccount || !walletAddress || !quote) return;

    setSwapToast('sending');
    setTxHash(null);
    try {
      const addrIn = getTokenAddress(tokenIn);
      const addrOut = getTokenAddress(tokenOut);
      const decimalsIn = getTokenDecimals(tokenIn);
      const decimalsOut = getTokenDecimals(tokenOut);
      const amountInWei = parseUnits(amountIn, decimalsIn);
      const amountOutWei = parseUnits(quote.amountOut, decimalsOut);
      const amountOutMinimum = (amountOutWei * 995n) / 1000n;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);
      const isNativeIn = tokenIn.toUpperCase() === 'MON';

      const calls: Array<{ to: Address; value: bigint; data: `0x${string}` }> = [];

      if (!isNativeIn) {
        calls.push({
          to: addrIn,
          value: 0n,
          data: encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [SWAP_ROUTER, amountInWei],
          }),
        });
      }

      calls.push({
        to: SWAP_ROUTER,
        value: isNativeIn ? amountInWei : 0n,
        data: encodeFunctionData({
          abi: SWAP_ROUTER_ABI,
          functionName: 'exactInputSingle',
          args: [
            {
              tokenIn: addrIn,
              tokenOut: addrOut,
              fee: 3000,
              recipient: walletAddress as Address,
              deadline,
              amountIn: amountInWei,
              amountOutMinimum,
              sqrtPriceLimitX96: 0n,
            },
          ],
        }),
      });

      setSwapToast('confirming');

      const userOpHash = await kernelClient.sendUserOperation({
        callData: await smartAccount.encodeCalls(calls),
      });

      const receipt = await kernelClient.waitForUserOperationReceipt({
        hash: userOpHash,
      });

      const hash = receipt.receipt.transactionHash;
      console.log('Swap tx:', hash);
      setTxHash(hash);
      setSwapToast('done');
      setAmountIn('');
      refreshBalances();
      setTimeout(() => setSwapToast(null), 5000);
    } catch (e: any) {
      console.error('Swap error:', e);
      alert(`Swap 失败: ${e?.shortMessage || e?.message || '未知错误'}`);
      setSwapToast(null);
    }
  };

  const handleSwitchTokens = () => {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setAmountIn('');
  };

  return (
    <div className="w-full">
      <div className="bg-[#18181B] rounded-3xl p-4 border border-zinc-800">
        <div className="flex justify-between items-center mb-4 px-2">
          <span className="font-medium text-zinc-400">Swap</span>
          <Settings className="w-5 h-5 text-zinc-400 cursor-pointer hover:text-white" />
        </div>

        <div className="bg-zinc-800 rounded-2xl p-4 mb-1 hover:bg-zinc-700/50 transition-colors">
          <div className="flex justify-between mb-2">
            <span className="text-zinc-400 text-sm">You pay</span>
            <span className="text-zinc-400 text-sm">Balance: {balanceIn}</span>
          </div>
          <div className="flex justify-between items-center">
            <input
              type="number"
              value={amountIn}
              onChange={(e) => setAmountIn(e.target.value)}
              placeholder="0"
              className="bg-transparent text-4xl font-medium outline-none w-full placeholder-zinc-600"
            />
            <TokenButton symbol={tokenIn} onClick={() => setTokenModal('in')} />
          </div>
        </div>

        <div className="flex justify-center -my-3 relative z-10">
          <button
            type="button"
            onClick={handleSwitchTokens}
            className="bg-[#000] p-1 rounded-xl border-4 border-[#000] hover:bg-zinc-800 transition-colors"
          >
            <div className="bg-zinc-800 p-2 rounded-lg">
              <ArrowDown className="w-4 h-4 text-zinc-400" />
            </div>
          </button>
        </div>

        <div className="bg-zinc-800 rounded-2xl p-4 mt-1 hover:bg-zinc-700/50 transition-colors">
          <div className="flex justify-between mb-2">
            <span className="text-zinc-400 text-sm">You receive</span>
            <span className="text-zinc-400 text-sm">Balance: {balanceOut}</span>
          </div>
          <div className="flex justify-between items-center">
            <input
              type="text"
              readOnly
              value={quoteLoading ? '...' : (quote?.amountOut ?? '')}
              placeholder="0"
              className={clsx(
                'bg-transparent text-4xl font-medium outline-none w-full placeholder-zinc-600',
                quoteLoading && 'text-zinc-500 animate-pulse'
              )}
            />
            <TokenButton symbol={tokenOut} onClick={() => setTokenModal('out')} />
          </div>
        </div>

        {quote && (
          <div className="mt-4 px-2 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Rate</span>
              <span className="text-zinc-400">1 {tokenOut} = {(1 / Number(quote.amountOut || 1) * Number(amountIn || 0)).toFixed(4)} {tokenIn}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Price Impact</span>
              <span className="text-[#22C55E]">~{quote.priceImpact}%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Route</span>
              <span className="text-zinc-400">{tokenIn} → {tokenOut} (OpenClaw Pool)</span>
            </div>
          </div>
        )}

        <div className="mt-4">
          <button
            type="button"
            onClick={handleSwap}
            disabled={!quote || quoteLoading || !!insufficientBalance}
            className={clsx(
              'w-full font-bold py-4 rounded-2xl text-xl transition-all',
              insufficientBalance && 'bg-zinc-700 text-zinc-500 cursor-not-allowed',
              !insufficientBalance && !quote && 'bg-zinc-700 text-zinc-500 cursor-not-allowed',
              quote && !quoteLoading && !insufficientBalance && 'bg-[#7C3AED] hover:bg-violet-600 text-white'
            )}
          >
            {insufficientBalance ? 'Insufficient Balance' : quoteLoading ? 'Fetching Price...' : 'Swap'}
          </button>
        </div>
      </div>

      {swapToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-xl bg-[#18181B] border border-zinc-700 text-sm text-zinc-300 flex items-center gap-2">
          {swapToast === 'sending' && '构建交易中...'}
          {swapToast === 'confirming' && '等待链上确认...'}
          {swapToast === 'done' && (
            <>
              ✅ 交易成功
              {txHash && (
                <a
                  href={`https://testnet.monadexplorer.com/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#7C3AED] hover:underline ml-1"
                >
                  查看 ↗
                </a>
              )}
            </>
          )}
        </div>
      )}

      <div className="mt-6">
        <h3 className="text-zinc-500 text-sm mb-2 px-2">最近交易</h3>
        <ul className="space-y-2">
          {MOCK_RECENT_TRADES.map((t) => (
            <li key={t.id} className="flex justify-between items-center py-2 px-3 rounded-xl bg-[#18181B] border border-zinc-800">
              <span className="text-zinc-300">{t.summary}</span>
              <span className="text-zinc-500 text-sm">{t.time}</span>
            </li>
          ))}
        </ul>
      </div>

      {tokenModal && (
        <TokenModal
          current={tokenModal === 'in' ? tokenIn : tokenOut}
          onSelect={(sym) => {
            if (tokenModal === 'in') setTokenIn(sym);
            else setTokenOut(sym);
          }}
          onClose={() => setTokenModal(null)}
        />
      )}
    </div>
  );
}
