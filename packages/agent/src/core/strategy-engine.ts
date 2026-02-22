import { BaseStrategy, StrategyContext } from '../strategies/base-strategy';

export class StrategyEngine {
  private strategies: BaseStrategy[] = [];
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(private context: StrategyContext) {}

  registerStrategy(strategy: BaseStrategy) {
    this.strategies.push(strategy);
  }

  start(intervalMs: number = 10000) {
    if (this.isRunning) return;
    this.isRunning = true;
    
    this.intervalId = setInterval(async () => {
      await this.runCycle();
    }, intervalMs);
    
    console.log('Strategy Engine started');
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('Strategy Engine stopped');
  }

  private async runCycle() {
    console.log('Running strategy cycle...');
    for (const strategy of this.strategies) {
      try {
        await strategy.evaluate(this.context);
      } catch (e) {
        console.error(`Error in strategy ${strategy.name}:`, e);
      }
    }
  }
}
