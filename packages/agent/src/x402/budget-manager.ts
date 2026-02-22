export interface BudgetConfig {
  dailyLimit: bigint; // In wei
  maxPerTransaction: bigint; // In wei
}

export class BudgetManager {
  private dailySpend = 0n;
  private lastReset = Date.now();
  private whitelist: string[] = []; // Whitelisted domains

  constructor(private config: BudgetConfig) {}

  checkBudget(amount: bigint, url: string): boolean {
    this.resetDailyIfNeeded();

    if (amount > this.config.maxPerTransaction) {
      console.warn(`Amount ${amount} exceeds max per transaction ${this.config.maxPerTransaction}`);
      return false;
    }

    if (this.dailySpend + amount > this.config.dailyLimit) {
      console.warn(`Daily limit exceeded. Spend: ${this.dailySpend}, Limit: ${this.config.dailyLimit}`);
      return false;
    }
    
    // Check whitelist if needed
    // const domain = new URL(url).hostname;
    // if (!this.whitelist.includes(domain)) return false;

    return true;
  }

  recordSpend(amount: bigint) {
    this.dailySpend += amount;
  }

  private resetDailyIfNeeded() {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    if (now - this.lastReset > oneDay) {
      this.dailySpend = 0n;
      this.lastReset = now;
    }
  }
}
