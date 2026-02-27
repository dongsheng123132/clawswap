import { x402ResourceServer, HTTPFacilitatorClient } from '@x402/core/server';
import { ExactEvmScheme } from '@x402/evm/exact/server';

// Monad Testnet x402 configuration
const MONAD_NETWORK = 'eip155:10143' as const;
const MONAD_USDC = '0x534b2f3A21130d7a60830c2Df862319e593943A3';
const FACILITATOR_URL =
  process.env.X402_FACILITATOR_URL || 'https://x402-facilitator.molandak.org';

export const PAY_TO_ADDRESS =
  process.env.PAY_TO_ADDRESS || '0x408E2fC4FCAF2D38a6C9dcF07C6457bdFb6e0250';

// Create facilitator client
const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });

// Create ExactEvmScheme with Monad USDC money parser
const monadScheme = new ExactEvmScheme();
monadScheme.registerMoneyParser(async (amount: number, network: string) => {
  if (network === MONAD_NETWORK) {
    const tokenAmount = Math.floor(amount * 1_000_000).toString();
    return {
      amount: tokenAmount,
      asset: MONAD_USDC,
      extra: { name: 'USDC', version: '2' },
    };
  }
  return null;
});

// Create and export x402 resource server
export const x402Server = new x402ResourceServer(facilitatorClient);
x402Server.register(MONAD_NETWORK, monadScheme);

export { MONAD_NETWORK };
