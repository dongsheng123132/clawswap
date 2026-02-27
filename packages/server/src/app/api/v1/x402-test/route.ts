import { NextRequest, NextResponse } from 'next/server';
import { x402Server, PAY_TO_ADDRESS, MONAD_NETWORK } from '@/lib/x402-server';

export const dynamic = 'force-dynamic';

const RESOURCE_CONFIG = {
  scheme: 'exact' as const,
  network: MONAD_NETWORK,
  payTo: PAY_TO_ADDRESS,
  price: '$0.001' as const,
};

const RESOURCE_INFO = {
  url: '/api/v1/x402-test',
  resource: '/api/v1/x402-test',
  description: 'x402 payment test on Monad Testnet',
  mimeType: 'application/json',
};

export const GET = async (req: NextRequest) => {
  // Parse x-payment header (this is how @x402/fetch sends payment payload)
  const paymentHeader = req.headers.get('x-payment');
  let paymentPayload = null;

  if (paymentHeader) {
    try {
      paymentPayload = JSON.parse(paymentHeader);
    } catch {
      return NextResponse.json({ error: 'Invalid x-payment header' }, { status: 400 });
    }
  }

  // Use processPaymentRequest — handles both 402 response and verification+settlement
  const result = await x402Server.processPaymentRequest(
    paymentPayload,
    RESOURCE_CONFIG,
    RESOURCE_INFO
  );

  if (!result.success) {
    // No payment or invalid payment — return 402
    if (result.requiresPayment) {
      return NextResponse.json(
        {
          error: 'Payment Required',
          x402Version: 2,
          paymentRequirements: result.requiresPayment,
        },
        {
          status: 402,
          headers: {
            'X-Payment-Required': JSON.stringify(result.requiresPayment),
          },
        }
      );
    }

    // Verification or settlement failed
    return NextResponse.json(
      {
        error: result.error || 'Payment failed',
        verificationResult: result.verificationResult,
        settlementResult: result.settlementResult,
      },
      { status: 402 }
    );
  }

  // Payment verified and settled — return content
  const settleTx = result.settlementResult?.transaction || '';
  const payer = result.settlementResult?.payer || result.verificationResult?.payer || '';

  return NextResponse.json(
    {
      message: 'x402 payment verified on Monad Testnet!',
      paidAt: new Date().toISOString(),
      network: 'Monad Testnet (eip155:10143)',
      price: '$0.001 USDC',
      recipient: PAY_TO_ADDRESS,
      settlement: {
        transaction: settleTx,
        network: result.settlementResult?.network,
        payer,
      },
    },
    {
      headers: {
        'X-Payment-Response': JSON.stringify({
          success: true,
          transaction: settleTx,
          network: result.settlementResult?.network,
          payer,
        }),
      },
    }
  );
};
