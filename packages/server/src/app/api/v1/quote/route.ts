import { NextRequest, NextResponse } from 'next/server';
import { getQuote, symbolToAddress, symbolToDecimals } from '@/lib/monad';
import { parseUnits, formatUnits } from 'viem';

export const GET = async (req: NextRequest) => {
  // x402 payment protection is handled by /api/v1/x402-test endpoint
  // This endpoint is free to call for now

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
