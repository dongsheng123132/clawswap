import { AgentWallet } from '../wallet/agent-wallet';
import { DEXAggregator } from '../dex/aggregator';
import { IntentParser } from './intent-parser';
import { StrategyEngine } from './strategy-engine';
import { OpenClawAdapter } from '../dex/openclaw-adapter';
import { createPublicClient, http } from 'viem';
import { monadTestnet, MONAD_CONTRACTS } from '../wallet/chains';

export interface AgentConfig {
  privateKey?: string; // Or session key data
  rpcUrl?: string;
}

export class OpenClawAgent {
  wallet: AgentWallet;
  aggregator: DEXAggregator;
  intentParser: IntentParser;
  strategyEngine: StrategyEngine;
  
  constructor(config: AgentConfig) {
    this.wallet = new AgentWallet();
    this.aggregator = new DEXAggregator();
    this.intentParser = new IntentParser();
    
    const publicClient = createPublicClient({
        chain: monadTestnet,
        transport: http(config.rpcUrl || monadTestnet.rpcUrls.default.http[0])
    });

    // Register default adapters
    this.aggregator.registerAdapter(new OpenClawAdapter(publicClient));
    
    this.strategyEngine = new StrategyEngine({
      wallet: this.wallet,
      aggregator: this.aggregator,
      log: console.log,
    });
  }

  async start() {
    // Initialize wallet if key provided
    // await this.wallet.initFromSessionKey(...)
    
    this.strategyEngine.start();
  }

  async stop() {
    this.strategyEngine.stop();
  }

  async handleUserInstruction(text: string) {
    const intent = this.intentParser.parse(text);
    if (!intent) {
      return "Sorry, I didn't understand that.";
    }

    if (intent.action === 'swap') {
        // Execute swap logic
        // 1. Get Token Addresses from Symbols (Mock for now)
        const tokenIn = MONAD_CONTRACTS.USDC; // Assume intent.tokenIn maps to this
        const tokenOut = MONAD_CONTRACTS.WMON; // Assume intent.tokenOut maps to this
        const amount = BigInt(intent.amountIn) * 10n**6n; // Assume 6 decimals for USDC

        // 2. Get Quote
        const quote = await this.aggregator.getBestQuote(tokenIn, tokenOut, amount);
        if (!quote) return "No quote found.";

        // 3. Build Tx
        const tx = await this.aggregator.buildSwapTx({
            tokenIn,
            tokenOut,
            amountIn: amount,
            slippage: 0.5,
            recipient: '0x...', // Agent wallet address
            deadline: BigInt(Date.now() + 60000),
        }, quote);

        // 4. Send Tx
        // await this.wallet.sendTransaction(tx);
        
        return `Executing swap: ${intent.amountIn} ${intent.tokenIn} -> ${intent.tokenOut}`;
    }

    return "Processing...";
  }
}
