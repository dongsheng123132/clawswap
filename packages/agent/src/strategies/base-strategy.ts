import { AgentWallet } from '../wallet/agent-wallet';
import { DEXAggregator } from '../dex/aggregator';

export interface StrategyContext {
  wallet: AgentWallet;
  aggregator: DEXAggregator;
  log: (msg: string) => void;
}

export abstract class BaseStrategy {
  constructor(public name: string) {}

  abstract evaluate(context: StrategyContext): Promise<void>;
}
