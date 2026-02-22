import { Address } from 'viem';

export interface SwapIntent {
  action: 'swap';
  tokenIn: string; // Symbol, e.g. "USDC"
  tokenOut: string; // Symbol, e.g. "MON"
  amountIn: string; // String amount, e.g. "100"
}

export interface BalanceIntent {
  action: 'balance';
}

export type Intent = SwapIntent | BalanceIntent;

export class IntentParser {
  parse(text: string): Intent | null {
    text = text.trim();
    
    // Check for balance query
    if (/^(balance|余额|查询余额)/i.test(text)) {
      return { action: 'balance' };
    }

    // Check for swap: "Buy 100 MON with USDC" or "买100U的MON" or "swap 100 USDC to MON"
    // Simplified regex for demo
    // English: Buy <amount> <tokenOut> with <tokenIn>
    const buyRegex = /(?:buy|swap)\s+(\d+(?:\.\d+)?)\s*([a-zA-Z]+)\s*(?:with|for|to)\s*([a-zA-Z]+)/i;
    const matchBuy = text.match(buyRegex);
    if (matchBuy) {
      return {
        action: 'swap',
        amountIn: matchBuy[1],
        tokenOut: matchBuy[2].toUpperCase(),
        tokenIn: matchBuy[3].toUpperCase(),
      };
    }

    // Chinese: 买 <amount> <tokenIn> 的 <tokenOut> (Common phrasing: 用100U买MON -> Buy MON with 100 U)
    // Or: 买 <amount> <tokenOut> (Implicitly with base currency or USDT)
    // Let's support: "买100 MON" (Buy 100 MON) -> Assume with USDC? Or parse "用USDC买..."
    
    // Pattern: 用 <amount> <tokenIn> 买 <tokenOut>
    // Example: 用100USDC买MON
    const cnSwapRegex = /用\s*(\d+(?:\.\d+)?)\s*([a-zA-Z]+)\s*买\s*([a-zA-Z]+)/;
    const matchCn = text.match(cnSwapRegex);
    if (matchCn) {
      return {
        action: 'swap',
        amountIn: matchCn[1],
        tokenIn: matchCn[2].toUpperCase(),
        tokenOut: matchCn[3].toUpperCase(),
      };
    }
    
    // Pattern: 买 <amount> <tokenOut>
    // Example: 买100MON
    // We need to ask user "With what?" or assume default.
    // For now, let's just return null if ambiguous.

    return null;
  }
}
