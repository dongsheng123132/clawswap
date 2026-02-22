import {
  createKernelAccount,
  createKernelAccountClient,
  createZeroDevPaymasterClient,
} from '@zerodev/sdk';
import { signerToEcdsaValidator } from '@zerodev/ecdsa-validator';
import { getEntryPoint, KERNEL_V3_1 } from '@zerodev/sdk/constants';
import { http, createPublicClient } from 'viem';
import { monadTestnet } from './chains';

const PROJECT_ID = process.env.NEXT_PUBLIC_ZERODEV_PROJECT_ID || '';
const ZERODEV_RPC = `https://rpc.zerodev.app/api/v2/bundler/${PROJECT_ID}`;
const PAYMASTER_RPC = `https://rpc.zerodev.app/api/v2/paymaster/${PROJECT_ID}`;

const entryPoint = getEntryPoint('0.7');
const kernelVersion = KERNEL_V3_1;

export const createSmartWallet = async (signer: unknown) => {
  if (!PROJECT_ID) {
    throw new Error('NEXT_PUBLIC_ZERODEV_PROJECT_ID is not set');
  }

  const publicClient = createPublicClient({
    transport: http(monadTestnet.rpcUrls.default.http[0]),
    chain: monadTestnet,
  });

  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer: signer as Parameters<typeof signerToEcdsaValidator>[1]['signer'],
    entryPoint,
    kernelVersion,
  });

  const account = await createKernelAccount(publicClient, {
    plugins: {
      sudo: ecdsaValidator,
    },
    entryPoint,
    kernelVersion,
  });

  const paymasterClient = createZeroDevPaymasterClient({
    chain: monadTestnet,
    transport: http(PAYMASTER_RPC),
  });

  const kernelClient = createKernelAccountClient({
    account,
    chain: monadTestnet,
    bundlerTransport: http(ZERODEV_RPC),
    client: publicClient,
    paymaster: {
      getPaymasterData: (userOperation) => {
        return paymasterClient.sponsorUserOperation({
          userOperation,
        });
      },
    },
  });

  return {
    account,
    kernelClient,
    address: account.address,
  };
};
