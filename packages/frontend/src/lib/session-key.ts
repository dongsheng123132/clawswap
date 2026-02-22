import {
  serializePermissionAccount,
  toPermissionValidator,
} from '@zerodev/permissions';
import { toECDSASigner } from '@zerodev/permissions/signers';
import { toSudoPolicy } from '@zerodev/permissions/policies';
import { createKernelAccount, addressToEmptyAccount } from '@zerodev/sdk';
import { getEntryPoint, KERNEL_V3_1 } from '@zerodev/sdk/constants';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http } from 'viem';
import { monadTestnet } from './chains';

const entryPoint = getEntryPoint('0.7');
const kernelVersion = KERNEL_V3_1;

/**
 * 创建 Session Key 并序列化
 * 流程: 生成 session key → addressToEmptyAccount 空签名者 → toPermissionValidator
 * → 从 kernelClient.account 取 sudoValidator → createKernelAccount(sudo + regular)
 * → serializePermissionAccount。失败则返回简化对象。
 */
export const createAndSerializeSessionKey = async (
  publicClient: { chain: unknown; transport: unknown },
  kernelClient: { account: { address: string; kernelPluginManager?: { sudoValidator?: unknown } } }
) => {
  const sessionPrivateKey = generatePrivateKey();
  const sessionKeyAccount = privateKeyToAccount(sessionPrivateKey);

  const emptyAccount = addressToEmptyAccount(sessionKeyAccount.address);
  const emptySessionKeySigner = await toECDSASigner({
    signer: emptyAccount,
  });

  const sudoPolicy = toSudoPolicy({});

  const permissionPlugin = await toPermissionValidator(publicClient as any, {
    entryPoint,
    signer: emptySessionKeySigner,
    policies: [sudoPolicy],
    kernelVersion,
  });

  const ecdsaValidator = kernelClient.account.kernelPluginManager?.sudoValidator;

  if (!ecdsaValidator) {
    console.warn('Could not get ecdsaValidator, using simplified session key');
    return {
      sessionPrivateKey,
      serialized: JSON.stringify({
        sessionPrivateKey,
        smartWalletAddress: kernelClient.account.address,
        policies: ['sudo'],
      }),
    };
  }

  const sessionKeyKernelAccount = await createKernelAccount(publicClient as any, {
    entryPoint,
    plugins: {
      sudo: ecdsaValidator,
      regular: permissionPlugin,
    },
    kernelVersion,
  });

  const serialized = await serializePermissionAccount(sessionKeyKernelAccount);

  return {
    sessionPrivateKey,
    serialized,
  };
};
