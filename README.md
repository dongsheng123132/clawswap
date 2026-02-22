# OpenClaw - Monad AI Agent DEX

OpenClaw is an autonomous trading platform on Monad blockchain where AI Agents can trade and pay for services using x402 protocol.

## Features

- **DEX**: Fork of Uniswap V3 optimized for Monad (10000 TPS).
- **AI Agent**: Autonomous trading with natural language instructions.
- **x402 Payments**: Native HTTP 402 payment protocol support for API monetization.
- **Smart Wallet**: AA (Account Abstraction) wallet with Session Keys for secure agent delegation.

## Project Structure

- `packages/contracts`: Solidity smart contracts (Foundry).
- `packages/agent`: AI Agent core logic (Node.js/TypeScript).
- `packages/server`: x402 Payment Gateway & API (Next.js).
- `packages/frontend`: User Interface (Next.js + Wagmi + RainbowKit).
- `packages/sdk`: TypeScript SDK for external integration.

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm / npm
- Foundry (for contracts)

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables:
   Copy `.env.example` to `.env` in the **repository root** and fill in the required values.
   When you run `npm run dev`, the root `.env` is loaded via `dotenv-cli` and passed to all packages (frontend and server). Do not rely on per-package `.env` unless you run each package separately.
   - `MONAD_RPC_URL`: https://testnet-rpc.monad.xyz
   - `NEXT_PUBLIC_PRIVY_APP_ID`: Your Privy App ID
   - `X402_FACILITATOR_URL`: https://x402-facilitator.molandak.org (required for quote/swap APIs; server still starts without it and returns 503 for those routes)

3. Build packages:
   ```bash
   npm run build
   ```

### Running

**Development Mode:**
```bash
npm run dev
```
This will start:
- **Frontend**: http://localhost:3000
- **Server**: http://localhost:3001 (API base URL for local dev; set `NEXT_PUBLIC_API_URL=http://localhost:3001` in `.env` if the frontend calls the server API)
- Agent: (Runs as a background process or standalone)

### Smart Contracts

Compile contracts:
```bash
cd packages/contracts
forge build
```

Deploy to Monad Testnet:
```bash
forge script script/Deploy.s.sol --rpc-url monad-testnet --broadcast
```

## Documentation

See `ARCHITECTURE.md` and `TECH-SPEC.md` for detailed design.
