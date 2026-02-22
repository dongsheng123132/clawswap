import { wrapFetchWithPayment } from '@x402/fetch';
import { ExactEvmScheme } from '@x402/evm';
import { WalletClient, PublicClient, parseUnits } from 'viem';
import { BudgetManager } from './budget-manager';
import { MONAD_CONTRACTS, monadTestnet } from '../wallet/chains';

export const createX402Fetch = (
  walletClient: WalletClient, 
  publicClient: PublicClient,
  budgetManager: BudgetManager
) => {
  // Use ExactEvmScheme for Monad
  const scheme = new ExactEvmScheme({
    chainId: monadTestnet.id,
    tokenAddress: MONAD_CONTRACTS.USDC,
  });

  return wrapFetchWithPayment(fetch, {
    schemes: [scheme],
    walletClient: walletClient as any, // Type casting might be needed
    publicClient: publicClient as any,
    onPayment: async (details) => {
      // details contains amount, recipient, etc.
      // We need to check budget here
      const amount = BigInt(details.amount); // Assuming details.amount is string/number
      
      if (!budgetManager.checkBudget(amount, details.url || '')) {
        throw new Error('Budget exceeded');
      }
      
      console.log(`Paying ${amount} to ${details.recipient} for ${details.url}`);
      budgetManager.recordSpend(amount);
      
      return true; // Proceed with payment
    }
  });
};
