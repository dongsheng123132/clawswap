import { useState, useCallback, useEffect } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { createSmartWallet } from '@/lib/smart-wallet';
import { createAndSerializeSessionKey } from '@/lib/session-key';
import { usePublicClient } from 'wagmi';
import { getApiUrl } from '@/lib/api';

export function useSmartWallet() {
  const { user, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const publicClient = usePublicClient();

  const [smartAccount, setSmartAccount] = useState<any>(null);
  const [kernelClient, setKernelClient] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initWallet = useCallback(async () => {
    if (!authenticated || !user || wallets.length === 0) return;

    const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy');
    const wallet = embeddedWallet || wallets[0];
    if (!wallet) return;

    setLoading(true);
    setError(null);
    try {
      await wallet.switchChain(10143);
      const provider = await wallet.getEthereumProvider();
      const { account, kernelClient } = await createSmartWallet(provider as any);

      setSmartAccount(account);
      setKernelClient(kernelClient);
      console.log('Smart Wallet Created:', account.address);
    } catch (err: any) {
      console.error('Failed to init smart wallet:', err);
      setError(err?.message || 'Failed to create smart wallet');
    } finally {
      setLoading(false);
    }
  }, [authenticated, user, wallets]);

  useEffect(() => {
    if (authenticated && !smartAccount && !loading) {
      initWallet();
    }
  }, [authenticated, smartAccount, loading, initWallet]);

  const authorizeAgent = async (opts?: {
    strategyType?: string;
    strategyConfig?: Record<string, unknown>;
  }) => {
    if (!kernelClient || !publicClient || !user?.id) return false;

    try {
      const { serialized, sessionPrivateKey } = await createAndSerializeSessionKey(
        publicClient,
        kernelClient
      );

      const response = await fetch(getApiUrl('/api/v1/agent/authorize'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          serializedSessionKey: serialized,
          privateKey: sessionPrivateKey,
          agentAddress: smartAccount?.address ?? undefined,
          smartWalletAddress: smartAccount?.address ?? undefined,
          strategyType: opts?.strategyType,
          strategyConfig: opts?.strategyConfig,
          validUntil: Math.floor(Date.now() / 1000) + 24 * 3600,
        }),
      });

      if (!response.ok) throw new Error('Failed to authorize agent');
      return true;
    } catch (error) {
      console.error('Authorization failed:', error);
      return false;
    }
  };

  const revokeAgent = async () => {
    if (!user?.id) return false;
    try {
      const res = await fetch(getApiUrl('/api/v1/agent/revoke'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      if (!res.ok) throw new Error('Revoke failed');
      return true;
    } catch (error) {
      console.error('Revocation failed:', error);
      return false;
    }
  };

  return {
    user,
    smartAccount,
    kernelClient,
    loading,
    error,
    initWallet,
    authorizeAgent,
    revokeAgent,
    address: smartAccount?.address,
  };
}
