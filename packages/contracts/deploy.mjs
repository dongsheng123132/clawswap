/**
 * Deploy Uniswap V3 (OpenClaw) + WMON + TestUSDC to Monad Testnet.
 * Loads .env from repo root. Run: cd packages/contracts && node deploy.mjs
 */
import { createWalletClient, createPublicClient, http, parseEther, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootEnv = join(__dirname, '../../.env');
dotenv.config({ path: rootEnv });

const RPC = process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz';
const CHAIN_ID = 10143;

const chain = {
  id: CHAIN_ID,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};

function loadArtifact(path) {
  const full = join(__dirname, 'out', path);
  const raw = readFileSync(full, 'utf8');
  const j = JSON.parse(raw);
  const abi = j.abi;
  const rawBytecode = j.bytecode?.object;
  const bytecode = rawBytecode ? (rawBytecode.startsWith('0x') ? rawBytecode : `0x${rawBytecode}`) : undefined;
  return { abi, bytecode };
}

function main() {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) {
    console.error('PRIVATE_KEY not set. Use repo root .env or set PRIVATE_KEY.');
    process.exit(1);
  }

  const account = privateKeyToAccount(('0x' + pk.replace(/^0x/, '')));
  const transport = http(RPC);
  const walletClient = createWalletClient({ account, chain, transport });
  const publicClient = createPublicClient({ chain, transport });

  const deploy = async (name, artifact, args = [], opts = {}) => {
    console.log(`Deploying ${name}...`);
    const hash = await walletClient.deployContract({
      abi: artifact.abi,
      bytecode: artifact.bytecode,
      account,
      args,
      ...(opts.gas && { gas: opts.gas }),
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const addr = receipt.contractAddress;
    if (!addr) throw new Error(`${name}: no contractAddress in receipt`);
    console.log(`  ${name}: ${addr}`);
    return addr;
  };

  (async () => {
    try {
      const WMON_ART = loadArtifact('WMON.sol/WMON.json');
      const TestUSDC_ART = loadArtifact('TestUSDC.sol/TestUSDC.json');
      const Factory_ART = loadArtifact('OpenClawFactory.sol/OpenClawFactory.json');
      const SwapRouter_ART = loadArtifact('SwapRouter.sol/SwapRouter.json');
      const QuoterV2_ART = loadArtifact('Quoter.sol/QuoterV2.json');
      const NFPM_ART = loadArtifact('NonfungiblePositionManager.sol/NonfungiblePositionManager.json');
      const Pool_ART = loadArtifact('OpenClawPool.sol/OpenClawPool.json');

      const wmonAddress = await deploy('WMON', WMON_ART);
      const usdcAddress = await deploy('TestUSDC', TestUSDC_ART);
      const factoryAddress = await deploy('OpenClawFactory', Factory_ART);
      const routerAddress = await deploy('SwapRouter', SwapRouter_ART, [factoryAddress, wmonAddress]);
      const quoterAddress = await deploy('QuoterV2', QuoterV2_ART, [factoryAddress, wmonAddress]);
      const nfpmAddress = await deploy('NonfungiblePositionManager', NFPM_ART, [factoryAddress, wmonAddress, '0x0000000000000000000000000000000000000000'], { gas: 10_000_000n });

      console.log('Minting 1_000_000 USDC to deployer...');
      const mintHash = await walletClient.writeContract({
        address: usdcAddress,
        abi: TestUSDC_ART.abi,
        functionName: 'mint',
        args: [account.address, parseUnits('1000000', 6)],
        account,
      });
      await publicClient.waitForTransactionReceipt({ hash: mintHash });
      console.log('  Mint tx confirmed.');

      console.log('Wrapping 0.5 MON...');
      const wrapHash = await walletClient.writeContract({
        address: wmonAddress,
        abi: WMON_ART.abi,
        functionName: 'deposit',
        value: parseEther('0.5'),
        account,
      });
      await publicClient.waitForTransactionReceipt({ hash: wrapHash });
      console.log('  Wrap tx confirmed.');

      const [token0, token1] = wmonAddress.toLowerCase() < usdcAddress.toLowerCase() ? [wmonAddress, usdcAddress] : [usdcAddress, wmonAddress];
      const isWmonToken0 = token0.toLowerCase() === wmonAddress.toLowerCase();

      console.log('Creating pool (token0, token1, 3000)...');
      const createHash = await walletClient.writeContract({
        address: factoryAddress,
        abi: Factory_ART.abi,
        functionName: 'createPool',
        args: [token0, token1, 3000],
        account,
      });
      await publicClient.waitForTransactionReceipt({ hash: createHash });

      const poolAddress = await publicClient.readContract({
        address: factoryAddress,
        abi: Factory_ART.abi,
        functionName: 'getPool',
        args: [token0, token1, 3000],
      });
      if (!poolAddress || poolAddress === '0x0000000000000000000000000000000000000000') throw new Error('getPool returned zero');
      console.log('  Pool:', poolAddress);

      const sqrtPriceX96 = isWmonToken0
        ? 50122627039097n
        : 125270724187256972849283072n;

      console.log('Initializing pool (sqrtPriceX96)...');
      const initHash = await walletClient.writeContract({
        address: poolAddress,
        abi: Pool_ART.abi,
        functionName: 'initialize',
        args: [sqrtPriceX96],
        account,
      });
      await publicClient.waitForTransactionReceipt({ hash: initHash });
      console.log('  Pool initialized.');

      const maxApproval = 2n ** 256n - 1n;
      console.log('Approving WMON and USDC to NFPM...');
      const wmonApprove = await walletClient.writeContract({
        address: wmonAddress,
        abi: WMON_ART.abi,
        functionName: 'approve',
        args: [nfpmAddress, maxApproval],
        account,
      });
      await publicClient.waitForTransactionReceipt({ hash: wmonApprove });
      console.log('  WMON approved.');
      const usdcApprove = await walletClient.writeContract({
        address: usdcAddress,
        abi: TestUSDC_ART.abi,
        functionName: 'approve',
        args: [nfpmAddress, maxApproval],
        account,
      });
      await publicClient.waitForTransactionReceipt({ hash: usdcApprove });
      console.log('  USDC approved.');

      const amount0Desired = isWmonToken0 ? parseEther('0.4') : parseUnits('100000', 6);
      const amount1Desired = isWmonToken0 ? parseUnits('100000', 6) : parseEther('0.4');
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

      console.log('Adding liquidity (mint on NFPM)...');
      const mintHash2 = await walletClient.writeContract({
        address: nfpmAddress,
        abi: NFPM_ART.abi,
        functionName: 'mint',
        args: [{
          token0,
          token1,
          fee: 3000,
          tickLower: -887220,
          tickUpper: 887220,
          amount0Desired,
          amount1Desired,
          amount0Min: 0n,
          amount1Min: 0n,
          recipient: account.address,
          deadline,
        }],
        account,
      });
      await publicClient.waitForTransactionReceipt({ hash: mintHash2 });
      console.log('  Liquidity added.');

      const out = {
        WMON: wmonAddress,
        USDC: usdcAddress,
        Factory: factoryAddress,
        SwapRouter: routerAddress,
        QuoterV2: quoterAddress,
        NFPM: nfpmAddress,
        Pool: poolAddress,
      };

      console.log('\n=== 部署结果 ===');
      Object.entries(out).forEach(([k, v]) => console.log(`${k}: ${v}`));

      const fs = await import('fs');
      fs.writeFileSync(join(__dirname, 'deployed-addresses.json'), JSON.stringify(out, null, 2));
      console.log('\nWritten to packages/contracts/deployed-addresses.json');
    } catch (e) {
      console.error('Error:', e.message || e);
      process.exit(1);
    }
  })();
}

main();
