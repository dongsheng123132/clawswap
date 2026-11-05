/**
 * Continue deployment: NFPM + create pool + add liquidity.
 * Uses already-deployed addresses from deployed-addresses.json.
 * Run: cd packages/contracts && node deploy-remaining.mjs
 */
import { createWalletClient, createPublicClient, http, parseEther, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env') });

const RPC = process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz';
const chain = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
};

function loadArtifact(path) {
  const raw = readFileSync(join(__dirname, 'out', path), 'utf8');
  const j = JSON.parse(raw);
  const rawBc = j.bytecode?.object;
  return {
    abi: j.abi,
    bytecode: rawBc ? (rawBc.startsWith('0x') ? rawBc : `0x${rawBc}`) : undefined,
  };
}

(async () => {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) { console.error('PRIVATE_KEY not set'); process.exit(1); }

  const account = privateKeyToAccount(`0x${pk.replace(/^0x/, '')}`);
  const transport = http(RPC);
  const walletClient = createWalletClient({ account, chain, transport });
  const publicClient = createPublicClient({ chain, transport });

  // Already deployed
  const wmonAddress = '0x21101761d8efb6c43de3cf12aab477d41763c210';
  const usdcAddress = '0x54766e965d19e49fbc781ad9beb73bf142d1a319';
  const factoryAddress = '0xc56e57cf0df0d8191302d5634f421a5f23589195';
  const routerAddress = '0x7286bf5de1fdbdf93253613e8232ac24941b711e';
  const quoterAddress = '0x7fbc5defa4bccbf771f35bdbeb3dd127ddeca275';

  const WMON_ART = loadArtifact('WMON.sol/WMON.json');
  const TestUSDC_ART = loadArtifact('TestUSDC.sol/TestUSDC.json');
  const Factory_ART = loadArtifact('OpenClawFactory.sol/OpenClawFactory.json');
  const NFPM_ART = loadArtifact('NonfungiblePositionManager.sol/NonfungiblePositionManager.json');
  const Pool_ART = loadArtifact('OpenClawPool.sol/OpenClawPool.json');

  try {
    // Check deployer balance
    const balance = await publicClient.getBalance({ address: account.address });
    console.log(`Deployer: ${account.address}`);
    console.log(`Balance: ${Number(balance) / 1e18} MON\n`);

    // Step 1: Deploy NFPM
    console.log('Step 1: Deploying NonfungiblePositionManager...');
    const nfpmHash = await walletClient.deployContract({
      abi: NFPM_ART.abi,
      bytecode: NFPM_ART.bytecode,
      account,
      args: [factoryAddress, wmonAddress, '0x0000000000000000000000000000000000000000'],
      gas: 10_000_000n,
    });
    console.log('  tx:', nfpmHash);
    const nfpmReceipt = await publicClient.waitForTransactionReceipt({ hash: nfpmHash });
    const nfpmAddress = nfpmReceipt.contractAddress;
    if (!nfpmAddress) throw new Error('NFPM deploy failed - no contractAddress');
    console.log('  NFPM deployed:', nfpmAddress);

    // Step 2: Mint test USDC
    console.log('\nStep 2: Minting 1,000,000 USDC...');
    const mintHash = await walletClient.writeContract({
      address: usdcAddress,
      abi: TestUSDC_ART.abi,
      functionName: 'mint',
      args: [account.address, parseUnits('1000000', 6)],
      account,
    });
    await publicClient.waitForTransactionReceipt({ hash: mintHash });
    console.log('  Done.');

    // Step 3: Wrap 0.5 MON -> WMON
    console.log('\nStep 3: Wrapping 0.5 MON -> WMON...');
    const wrapHash = await walletClient.writeContract({
      address: wmonAddress,
      abi: WMON_ART.abi,
      functionName: 'deposit',
      value: parseEther('0.5'),
      account,
    });
    await publicClient.waitForTransactionReceipt({ hash: wrapHash });
    console.log('  Done.');

    // Step 4: Create pool
    const [token0, token1] = wmonAddress.toLowerCase() < usdcAddress.toLowerCase()
      ? [wmonAddress, usdcAddress]
      : [usdcAddress, wmonAddress];
    const isWmonToken0 = token0.toLowerCase() === wmonAddress.toLowerCase();
    console.log(`\nStep 4: Creating pool (token0=${token0}, token1=${token1}, fee=3000)...`);
    console.log(`  WMON is token${isWmonToken0 ? '0' : '1'}`);

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
    if (!poolAddress || poolAddress === '0x0000000000000000000000000000000000000000') {
      throw new Error('getPool returned zero address');
    }
    console.log('  Pool:', poolAddress);

    // Step 5: Initialize pool
    // 1 MON = 0.40 USDC
    const sqrtPriceX96 = isWmonToken0
      ? 50122627039097n       // token0=WMON: price = 0.4 USDC/WMON in raw units
      : 125270724187256972849283072n; // token0=USDC: price = 1/0.4 WMON/USDC in raw units
    console.log(`\nStep 5: Initializing pool (sqrtPriceX96=${sqrtPriceX96})...`);
    const initHash = await walletClient.writeContract({
      address: poolAddress,
      abi: Pool_ART.abi,
      functionName: 'initialize',
      args: [sqrtPriceX96],
      account,
    });
    await publicClient.waitForTransactionReceipt({ hash: initHash });
    console.log('  Pool initialized.');

    // Step 6: Approve tokens for NFPM
    const maxApproval = 2n ** 256n - 1n;
    console.log('\nStep 6: Approving tokens for NFPM...');
    const a1 = await walletClient.writeContract({
      address: wmonAddress, abi: WMON_ART.abi,
      functionName: 'approve', args: [nfpmAddress, maxApproval], account,
    });
    await publicClient.waitForTransactionReceipt({ hash: a1 });
    console.log('  WMON approved.');
    const a2 = await walletClient.writeContract({
      address: usdcAddress, abi: TestUSDC_ART.abi,
      functionName: 'approve', args: [nfpmAddress, maxApproval], account,
    });
    await publicClient.waitForTransactionReceipt({ hash: a2 });
    console.log('  USDC approved.');

    // Step 7: Add liquidity
    const amount0 = isWmonToken0 ? parseEther('0.4') : parseUnits('100000', 6);
    const amount1 = isWmonToken0 ? parseUnits('100000', 6) : parseEther('0.4');
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    console.log(`\nStep 7: Adding liquidity (${isWmonToken0 ? '0.4 WMON + 100K USDC' : '100K USDC + 0.4 WMON'})...`);
    const mintLpHash = await walletClient.writeContract({
      address: nfpmAddress,
      abi: NFPM_ART.abi,
      functionName: 'mint',
      args: [{
        token0, token1,
        fee: 3000,
        tickLower: -887220,
        tickUpper: 887220,
        amount0Desired: amount0,
        amount1Desired: amount1,
        amount0Min: 0n,
        amount1Min: 0n,
        recipient: account.address,
        deadline,
      }],
      account,
      gas: 5_000_000n,
    });
    const lpReceipt = await publicClient.waitForTransactionReceipt({ hash: mintLpHash });
    console.log('  Liquidity added! tx:', lpReceipt.transactionHash);

    // Save results
    const out = {
      WMON: wmonAddress,
      USDC: usdcAddress,
      Factory: factoryAddress,
      SwapRouter: routerAddress,
      QuoterV2: quoterAddress,
      NFPM: nfpmAddress,
      Pool: poolAddress,
    };

    console.log('\n=== 部署完成 ===');
    Object.entries(out).forEach(([k, v]) => console.log(`${k}: ${v}`));

    writeFileSync(join(__dirname, 'deployed-addresses.json'), JSON.stringify(out, null, 2));
    console.log('\nSaved to deployed-addresses.json');

  } catch (e) {
    console.error('\nError:', e.shortMessage || e.message || e);
    if (e.details) console.error('Details:', e.details);
    process.exit(1);
  }
})();
