import { NextRequest, NextResponse } from 'next/server';
import { withX402 } from '@x402/next';
import { x402Server, PAY_TO_ADDRESS, MONAD_NETWORK } from '@/lib/x402-server';

const routeConfig = {
  accepts: {
    scheme: 'exact',
    network: MONAD_NETWORK,
    payTo: PAY_TO_ADDRESS,
    price: '$0.001',
  },
  resource: '/api/v1/x402-test',
};

async function handler(_req: NextRequest) {
  return NextResponse.json({
    message: 'x402 payment verified on Monad Testnet!',
    paidAt: new Date().toISOString(),
    network: 'Monad Testnet (eip155:10143)',
    price: '$0.001 USDC',
    recipient: PAY_TO_ADDRESS,
  });
}

export const GET = withX402(handler, routeConfig, x402Server);
