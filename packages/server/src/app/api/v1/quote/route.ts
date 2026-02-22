import { NextRequest, NextResponse } from 'next/server';
import { getX402, PAY_TO_ADDRESS } from '@/lib/x402-server';
import { CONTRACTS, getQuote, symbolToAddress, symbolToDecimals } from '@/lib/monad';
import { prisma } from '@/lib/db';
import { parseUnits, formatUnits } from 'viem';

export const GET = async (req: NextRequest) => {
  let x402;
  try {
    x402 = getX402();
  } catch {
    // x402 not configured — skip payment for now (dev mode)
  }

  if (x402) {
    const paymentOptions = {
      recipient: PAY_TO_ADDRESS,
      amount: '0.0001',
      token: CONTRACTS.USDC,
      chainId: 10143,
    };
    const { isAuthorized, paymentError, headers } = await x402.validateRequest(req, paymentOptions);
    if (!isAuthorized) {
      return NextResponse.json(
        { error: 'Payment Required', details: paymentError },
        { status: 402, headers }
      );
    }
    try {
      await prisma.apiCallLog.create({
        data: { endpoint: '/api/v1/quote', paidAmount: paymentOptions.amount },
      });
    } catch (_) {}
  }

  const searchParams = req.nextUrl.searchParams;
  const tokenInSymbol = searchParams.get('tokenIn');
  const tokenOutSymbol = searchParams.get('tokenOut');
  const amountInStr = searchParams.get('amountIn');

  if (!tokenInSymbol || !tokenOutSymbol || !amountInStr) {
    return NextResponse.json(
      { error: 'Missing parameters: tokenIn, tokenOut, amountIn' },
      { status: 400 }
    );
  }

  const tokenIn = symbolToAddress(tokenInSymbol);
  const tokenOut = symbolToAddress(tokenOutSymbol);
  if (!tokenIn || !tokenOut) {
    return NextResponse.json(
      { error: 'Unknown token symbol. Supported: USDC, MON/WMON' },
      { status: 400 }
    );
  }

  const decimalsIn = symbolToDecimals(tokenInSymbol);
  const decimalsOut = symbolToDecimals(tokenOutSymbol);

  let amountInWei: bigint;
  try {
    amountInWei = parseUnits(amountInStr, decimalsIn);
  } catch {
    return NextResponse.json({ error: 'Invalid amountIn' }, { status: 400 });
  }

  const quote = await getQuote(tokenIn, tokenOut, amountInWei);
  if (!quote) {
    return NextResponse.json(
      {
        error:
          'Quote failed — pool may not exist or have insufficient liquidity',
      },
      { status: 502 }
    );
  }

  const amountOutFormatted = formatUnits(quote.amountOut, decimalsOut);

  return NextResponse.json({
    tokenIn: tokenInSymbol,
    tokenOut: tokenOutSymbol,
    amountIn: amountInStr,
    amountOut: amountOutFormatted,
    amountOutRaw: quote.amountOut.toString(),
    estimatedGas: quote.gasEstimate.toString(),
    dex: 'Uniswap V3 (Monad)',
    fee: '0.3%',
    priceImpact: 0.1,
  });
};
