import { NextRequest, NextResponse } from 'next/server';
import { getX402, PAY_TO_ADDRESS } from '@/lib/x402-server';
import {
  CONTRACTS,
  SWAP_ROUTER_ABI,
  getQuote,
  symbolToAddress,
  symbolToDecimals,
} from '@/lib/monad';
import { prisma } from '@/lib/db';
import { parseUnits, encodeFunctionData, type Address } from 'viem';

export const POST = async (req: NextRequest) => {
  let x402;
  try {
    x402 = getX402();
  } catch {}

  if (x402) {
    const paymentOptions = {
      recipient: PAY_TO_ADDRESS,
      amount: '0.001',
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
        data: { endpoint: '/api/v1/swap', paidAmount: paymentOptions.amount },
      });
    } catch (_) {}
  }

  try {
    const body = await req.json();
    const {
      tokenIn: tokenInSymbol,
      tokenOut: tokenOutSymbol,
      amountIn: amountInStr,
      walletAddress,
      slippage = 0.5,
    } = body;

    if (!tokenInSymbol || !tokenOutSymbol || !amountInStr || !walletAddress) {
      return NextResponse.json(
        { error: 'Missing: tokenIn, tokenOut, amountIn, walletAddress' },
        { status: 400 }
      );
    }

    const tokenIn = symbolToAddress(tokenInSymbol);
    const tokenOut = symbolToAddress(tokenOutSymbol);
    if (!tokenIn || !tokenOut) {
      return NextResponse.json({ error: 'Unknown token symbol' }, { status: 400 });
    }

    const decimalsIn = symbolToDecimals(tokenInSymbol);
    const amountInWei = parseUnits(amountInStr, decimalsIn);

    const quote = await getQuote(tokenIn, tokenOut, amountInWei);
    if (!quote) {
      return NextResponse.json({ error: 'Quote failed' }, { status: 502 });
    }

    const slippageBps = BigInt(Math.floor(slippage * 100));
    const amountOutMinimum = (quote.amountOut * (10000n - slippageBps)) / 10000n;

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);

    const data = encodeFunctionData({
      abi: SWAP_ROUTER_ABI,
      functionName: 'exactInputSingle',
      args: [
        {
          tokenIn,
          tokenOut,
          fee: 3000,
          recipient: walletAddress as Address,
          deadline,
          amountIn: amountInWei,
          amountOutMinimum,
          sqrtPriceLimitX96: 0n,
        },
      ],
    });

    const isNativeIn = tokenIn.toLowerCase() === CONTRACTS.WMON.toLowerCase();

    return NextResponse.json({
      txData: {
        to: CONTRACTS.SWAP_ROUTER,
        data,
        value: isNativeIn ? amountInWei.toString() : '0',
        chainId: 10143,
      },
      quote: {
        amountOut: quote.amountOut.toString(),
        amountOutMinimum: amountOutMinimum.toString(),
        estimatedGas: quote.gasEstimate.toString(),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
};
