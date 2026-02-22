import { BaseStrategy, StrategyContext } from './base-strategy';

export class DCAStrategy extends BaseStrategy {
  constructor() {
    super('DCA');
  }

  async evaluate(context: StrategyContext): Promise<void> {
    // Check if it's time to buy
    // e.g. every day at 10am
    // context.log("Checking DCA...");
  }
}
