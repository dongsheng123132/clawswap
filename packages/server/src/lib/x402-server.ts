// x402 integration stub
// The @x402/core and @x402/evm packages don't export the expected types yet.
// This module provides a no-op implementation so the rest of the server compiles.
// When x402 SDK is updated with proper exports, replace this stub.

/** Returns the x402 resource server instance. Currently always throws (not available). */
export function getX402(): any {
  throw new Error('x402 not available — @x402/core exports are not yet compatible');
}

export const PAY_TO_ADDRESS =
  process.env.PAY_TO_ADDRESS || '0x0000000000000000000000000000000000000000';
