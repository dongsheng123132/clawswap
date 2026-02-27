'use client';

import { useState } from 'react';
import {
  parseUnits,
  parseAbi,
  createWalletClient,
  createPublicClient,
  custom,
  http,
  type Address,
} from 'viem';
import { useWallets } from '@privy-io/react-auth';
import { monadTestnet, CONTRACTS } from '@/lib/chains';
import { useGrid, type GridCell } from '@/hooks/useGrid';

const PAY_TO_ADDRESS = '0x408E2fC4FCAF2D38a6C9dcF07C6457bdFb6e0250' as Address;
const USDC_ADDR = CONTRACTS.USDC;

const ERC20_ABI = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
]);

type PayMethod = 'USDC' | 'MON' | 'x402';

const CELL_COLORS = [
  '#7C3AED', '#EC4899', '#F59E0B', '#10B981',
  '#3B82F6', '#EF4444', '#8B5CF6', '#06B6D4', '#F97316',
];

export default function GridTab() {
  const { cells, loading, owned, total, purchaseCell } = useGrid();
  const { wallets } = useWallets();
  const [selected, setSelected] = useState<GridCell | null>(null);
  const [payMethod, setPayMethod] = useState<PayMethod>('USDC');
  const [status, setStatus] = useState<'idle' | 'sending' | 'verifying' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [lastTx, setLastTx] = useState('');

  const eoaAddress = wallets[0]?.address as Address | undefined;

  const handleCellClick = (cell: GridCell) => {
    if (cell.ownerId) return; // already owned
    setSelected(cell);
    setStatus('idle');
    setErrorMsg('');
    setLastTx('');
  };

  const closeModal = () => {
    setSelected(null);
    setStatus('idle');
    setErrorMsg('');
  };

  const handlePurchase = async () => {
    if (!selected || !eoaAddress || !wallets[0]) return;

    setStatus('sending');
    setErrorMsg('');

    try {
      await wallets[0].switchChain(10143);
      const provider = await wallets[0].getEthereumProvider();
      const walletClient = createWalletClient({
        chain: monadTestnet,
        transport: custom(provider),
      });
      const publicClient = createPublicClient({
        chain: monadTestnet,
        transport: http(monadTestnet.rpcUrls.default.http[0]),
      });
      const [account] = await walletClient.getAddresses();

      let txHash: `0x${string}`;

      if (payMethod === 'MON') {
        // Native MON transfer: 0.001 MON
        txHash = await walletClient.sendTransaction({
          to: PAY_TO_ADDRESS,
          value: parseUnits('0.001', 18),
          account,
          chain: monadTestnet,
        });
      } else {
        // USDC or x402: ERC20 transfer 0.01 USDC
        txHash = await walletClient.writeContract({
          address: USDC_ADDR,
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [PAY_TO_ADDRESS, parseUnits('0.01', 6)],
          account,
        });
      }

      // Wait for confirmation
      setStatus('verifying');
      await publicClient.waitForTransactionReceipt({ hash: txHash });

      // Tell server to verify and record
      const colorPick = CELL_COLORS[selected.index % CELL_COLORS.length];
      await purchaseCell({
        cellIndex: selected.index,
        payMethod,
        txHash,
        buyerAddress: account,
        label: shortenAddr(account),
        color: colorPick,
      });

      setLastTx(txHash);
      setStatus('done');
    } catch (e: any) {
      console.error('Purchase error:', e);
      setErrorMsg(e?.shortMessage || e?.message || 'Transaction failed');
      setStatus('error');
    }
  };

  const priceLabel = payMethod === 'MON' ? '0.001 MON' : '0.01 USDC';

  return (
    <div className="w-full">
      {/* Header */}
      <div className="bg-[#18181B] rounded-2xl p-4 border border-zinc-800 mb-4">
        <div className="flex justify-between items-center mb-2">
          <h2 className="font-bold text-lg">x402 Payment Grid</h2>
          <span className="text-sm text-zinc-400">{owned}/{total} sold</span>
        </div>
        <p className="text-zinc-500 text-sm">
          Click a cell to purchase it with USDC, MON, or x402 protocol. On-chain verified.
        </p>
      </div>

      {/* 3x3 Grid */}
      {loading ? (
        <div className="text-center py-12 text-zinc-500">Loading grid...</div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {cells.map((cell) => (
            <button
              key={cell.index}
              type="button"
              onClick={() => handleCellClick(cell)}
              className={`
                aspect-square rounded-xl border-2 flex flex-col items-center justify-center
                transition-all text-sm font-medium
                ${cell.ownerId
                  ? 'border-transparent cursor-default'
                  : 'border-zinc-700 hover:border-[#7C3AED] hover:bg-zinc-800/50 cursor-pointer'
                }
              `}
              style={{
                backgroundColor: cell.ownerId ? cell.color + '30' : '#18181B',
                borderColor: cell.ownerId ? cell.color : undefined,
              }}
            >
              {cell.ownerId ? (
                <>
                  <span className="text-xs opacity-60">{cell.payMethod}</span>
                  <span className="font-bold" style={{ color: cell.color }}>
                    {cell.label || `#${cell.index}`}
                  </span>
                  <span className="text-[10px] text-zinc-500 mt-1">SOLD</span>
                </>
              ) : (
                <>
                  <span className="text-zinc-600 text-2xl font-bold">{cell.index}</span>
                  <span className="text-zinc-600 text-xs">0.01 USDC</span>
                </>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Payment Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={closeModal}>
          <div
            className="bg-[#18181B] rounded-2xl border border-zinc-800 w-full max-w-sm p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <span className="font-bold text-lg">Purchase Cell #{selected.index}</span>
              <button type="button" onClick={closeModal} className="text-zinc-500 hover:text-white text-lg">
                x
              </button>
            </div>

            {/* Payment method selector */}
            <div className="flex gap-2 mb-4">
              {(['USDC', 'MON', 'x402'] as PayMethod[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPayMethod(m)}
                  className={`
                    flex-1 py-2 rounded-xl text-sm font-medium transition-all
                    ${payMethod === m
                      ? 'bg-[#7C3AED] text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:text-white'
                    }
                  `}
                >
                  {m}
                </button>
              ))}
            </div>

            {/* Price info */}
            <div className="bg-zinc-800 rounded-xl p-3 mb-4 text-sm">
              <div className="flex justify-between mb-1">
                <span className="text-zinc-400">Price</span>
                <span className="text-white font-medium">{priceLabel}</span>
              </div>
              <div className="flex justify-between mb-1">
                <span className="text-zinc-400">Method</span>
                <span className="text-white">{payMethod === 'x402' ? 'x402 Protocol (USDC)' : payMethod}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Recipient</span>
                <span className="text-zinc-500 font-mono text-xs">{shortenAddr(PAY_TO_ADDRESS)}</span>
              </div>
            </div>

            {/* Status messages */}
            {status === 'sending' && (
              <div className="text-center py-3 text-sm text-yellow-400 animate-pulse">
                Sending transaction...
              </div>
            )}
            {status === 'verifying' && (
              <div className="text-center py-3 text-sm text-blue-400 animate-pulse">
                Verifying on-chain...
              </div>
            )}
            {status === 'done' && (
              <div className="text-center py-3">
                <div className="text-green-400 font-medium mb-1">Purchase successful!</div>
                {lastTx && (
                  <a
                    href={`https://testnet.monadexplorer.com/tx/${lastTx}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#7C3AED] text-sm hover:underline"
                  >
                    View on Explorer
                  </a>
                )}
              </div>
            )}
            {status === 'error' && (
              <div className="text-center py-3 text-sm text-red-400">
                {errorMsg}
              </div>
            )}

            {/* Action button */}
            {status !== 'done' && (
              <button
                type="button"
                onClick={handlePurchase}
                disabled={status === 'sending' || status === 'verifying' || !eoaAddress}
                className={`
                  w-full py-3 rounded-xl font-bold text-lg transition-all
                  ${status === 'sending' || status === 'verifying'
                    ? 'bg-zinc-700 text-zinc-500 cursor-wait'
                    : 'bg-[#7C3AED] hover:bg-violet-600 text-white'
                  }
                `}
              >
                {!eoaAddress
                  ? 'Connect Wallet'
                  : status === 'sending'
                  ? 'Sending...'
                  : status === 'verifying'
                  ? 'Verifying...'
                  : `Pay ${priceLabel}`
                }
              </button>
            )}

            {status === 'done' && (
              <button
                type="button"
                onClick={closeModal}
                className="w-full py-3 rounded-xl font-bold text-lg bg-zinc-800 text-white hover:bg-zinc-700"
              >
                Close
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function shortenAddr(addr: string) {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}..${addr.slice(-4)}`;
}
