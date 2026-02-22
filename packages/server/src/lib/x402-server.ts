import { HttpFacilitatorClient } from '@x402/core';
import { ExactEvmScheme, createX402ResourceServer } from '@x402/evm';
import { monadTestnet, MONAD_CONTRACTS } from './monad';
import { parseUnits } from 'viem';

let facilitatorClient: HttpFacilitatorClient | null = null;
let x402Instance: ReturnType<typeof createX402ResourceServer> | null = null;

if (process.env.X402_FACILITATOR_URL) {
    facilitatorClient = new HttpFacilitatorClient(process.env.X402_FACILITATOR_URL);
    x402Instance = createX402ResourceServer({
        facilitatorClient,
        schemes: [
            new ExactEvmScheme({
                chainId: monadTestnet.id,
                tokenAddress: MONAD_CONTRACTS.USDC,
            }),
        ],
    });
    // Register money parser: "0.001" (USD) -> 1000 (USDC wei, 6 decimals)
    x402Instance.registerMoneyParser((amount) => parseUnits(amount, 6));
}

/** Returns the x402 resource server instance. Throws if X402_FACILITATOR_URL is not set. */
export function getX402(): NonNullable<typeof x402Instance> {
    if (!x402Instance) {
        throw new Error('X402_FACILITATOR_URL is not set');
    }
    return x402Instance;
}

export const PAY_TO_ADDRESS =
    process.env.PAY_TO_ADDRESS || '0x0000000000000000000000000000000000000000';
