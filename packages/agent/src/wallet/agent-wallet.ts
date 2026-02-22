import { createKernelAccountClient, createKernelAccount } from "@zerodev/sdk";
import { signerToEcdsaValidator } from "@zerodev/ecdsa-validator";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http, type Hex, type Address } from "viem";
import { ENTRYPOINT_ADDRESS_V07 } from "permissionless";
import { monadTestnet } from "./chains";

export class AgentWallet {
  private kernelClient: any;
  private address: Address | undefined;

  constructor() {}

  async initFromSessionKey(serializedSessionKey: string, privateKey: Hex) {
    // In a real implementation, we would deserialize the session key account
    // using deserializePermissionAccount from @zerodev/permissions
    
    // For now, we simulate using the private key directly as a signer
    // This is NOT the session key logic, but a placeholder to make it work
    // until we have the full session key flow implemented.
    
    const publicClient = createPublicClient({
      transport: http(monadTestnet.rpcUrls.default.http[0]),
      chain: monadTestnet,
    });

    const signer = privateKeyToAccount(privateKey);
    const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
      signer,
      entryPoint: ENTRYPOINT_ADDRESS_V07,
    });

    const account = await createKernelAccount(publicClient, {
      plugins: {
        sudo: ecdsaValidator,
      },
      entryPoint: ENTRYPOINT_ADDRESS_V07,
    });

    this.kernelClient = createKernelAccountClient({
      account,
      chain: monadTestnet,
      bundlerTransport: http("https://rpc.zerodev.app/api/v2/bundler/PROJECT_ID"), // TODO: Use env var
      client: publicClient,
    });
    
    this.address = account.address;
    console.log("Agent Wallet Initialized:", this.address);
  }

  async sendTransaction(tx: { to: Address; data: Hex; value?: bigint }) {
    if (!this.kernelClient) throw new Error("Wallet not initialized");
    
    const hash = await this.kernelClient.sendTransaction({
      to: tx.to,
      data: tx.data,
      value: tx.value || 0n,
    });
    
    return hash;
  }

  async sendBatchTransaction(txs: { to: Address; data: Hex; value?: bigint }[]) {
    if (!this.kernelClient) throw new Error("Wallet not initialized");
    
    // Kernel v3 supports batching natively
    const hash = await this.kernelClient.sendTransactions({
      transactions: txs.map(tx => ({
        to: tx.to,
        data: tx.data,
        value: tx.value || 0n,
      })),
    });
    
    return hash;
  }

  async getBalance() {
    if (!this.address) return 0n;
    // Use public client to get balance
    // implementation omitted for brevity
    return 0n; 
  }
}
