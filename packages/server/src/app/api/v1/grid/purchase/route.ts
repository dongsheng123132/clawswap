import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { publicClient, CONTRACTS } from '@/lib/monad';
import { type Address, parseAbi, decodeEventLog } from 'viem';

const PAY_TO_ADDRESS = '0x408E2fC4FCAF2D38a6C9dcF07C6457bdFb6e0250' as Address;

const USDC_PRICE = BigInt(10000); // 0.01 USDC (6 decimals)
const MON_PRICE = BigInt('1000000000000000'); // 0.001 MON (18 decimals)

const ERC20_TRANSFER_EVENT = parseAbi([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);

export const POST = async (req: NextRequest) => {
  try {
    const body = await req.json();
    const { cellIndex, payMethod, txHash, buyerAddress, label, color } = body;

    // Validate input
    if (cellIndex == null || !payMethod || !txHash || !buyerAddress) {
      return NextResponse.json(
        { error: 'Missing required fields: cellIndex, payMethod, txHash, buyerAddress' },
        { status: 400 }
      );
    }

    if (![0, 1, 2, 3, 4, 5, 6, 7, 8].includes(cellIndex)) {
      return NextResponse.json({ error: 'Invalid cellIndex (0-8)' }, { status: 400 });
    }

    if (!['USDC', 'MON', 'x402'].includes(payMethod)) {
      return NextResponse.json(
        { error: 'Invalid payMethod. Must be USDC, MON, or x402' },
        { status: 400 }
      );
    }

    // Check cell not already owned
    const cell = await prisma.gridCell.findUnique({ where: { index: cellIndex } });
    if (!cell) {
      return NextResponse.json({ error: 'Cell not found' }, { status: 404 });
    }
    if (cell.ownerId) {
      return NextResponse.json({ error: 'Cell already purchased' }, { status: 409 });
    }

    // Verify payment based on method
    if (payMethod === 'x402') {
      // x402 payments are verified by the x402-test endpoint via facilitator
      // The txHash here is the settlement tx from the facilitator
      // We trust it since withX402 already verified the payment
    } else if (payMethod === 'MON') {
      // For MON: verify native transfer on-chain
      let receipt;
      try {
        receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
      } catch {
        return NextResponse.json(
          { error: 'Transaction not found on-chain. Wait for confirmation and retry.' },
          { status: 404 }
        );
      }
      if (receipt.status !== 'success') {
        return NextResponse.json({ error: 'Transaction reverted' }, { status: 400 });
      }
      const tx = await publicClient.getTransaction({ hash: txHash as `0x${string}` });
      const toMatch = tx.to?.toLowerCase() === PAY_TO_ADDRESS.toLowerCase();
      const valueOk = tx.value >= MON_PRICE;
      if (!toMatch || !valueOk) {
        return NextResponse.json(
          { error: `MON payment verification failed. Expected >= 0.001 MON to ${PAY_TO_ADDRESS}` },
          { status: 400 }
        );
      }
    } else {
      // USDC: verify ERC20 Transfer event on-chain
      let receipt;
      try {
        receipt = await publicClient.getTransactionReceipt({ hash: txHash as `0x${string}` });
      } catch {
        return NextResponse.json(
          { error: 'Transaction not found on-chain. Wait for confirmation and retry.' },
          { status: 404 }
        );
      }
      if (receipt.status !== 'success') {
        return NextResponse.json({ error: 'Transaction reverted' }, { status: 400 });
      }
      const transferLogs = receipt.logs.filter(
        (log) => log.address.toLowerCase() === CONTRACTS.USDC.toLowerCase()
      );

      let verified = false;
      for (const log of transferLogs) {
        try {
          const decoded = decodeEventLog({
            abi: ERC20_TRANSFER_EVENT,
            data: log.data,
            topics: log.topics,
          });
          if (
            decoded.eventName === 'Transfer' &&
            (decoded.args as any).to.toLowerCase() === PAY_TO_ADDRESS.toLowerCase() &&
            (decoded.args as any).value >= USDC_PRICE
          ) {
            verified = true;
            break;
          }
        } catch {
          // Not a Transfer event, skip
        }
      }

      if (!verified) {
        return NextResponse.json(
          { error: `USDC payment verification failed. Expected >= 0.01 USDC transfer to ${PAY_TO_ADDRESS}` },
          { status: 400 }
        );
      }
    }

    // Mark cell as purchased
    const updated = await prisma.gridCell.update({
      where: { index: cellIndex },
      data: {
        ownerId: buyerAddress,
        ownerAddr: buyerAddress,
        payMethod,
        txHash,
        label: label || `#${cellIndex}`,
        color: color || '#7C3AED',
      },
    });

    return NextResponse.json({ success: true, cell: updated });
  } catch (e: any) {
    console.error('POST /grid/purchase error:', e);
    return NextResponse.json(
      { error: e?.message || 'Internal error' },
      { status: 500 }
    );
  }
};
