/**
 * After deploy: run from repo root:
 *   node packages/contracts/scripts/update-frontend-addresses.mjs
 * Reads packages/contracts/deployed-addresses.json and updates
 * packages/frontend/src/lib/chains.ts and SwapTab.tsx placeholders.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../..');
const deployedPath = join(root, 'packages/contracts/deployed-addresses.json');
const chainsPath = join(root, 'packages/frontend/src/lib/chains.ts');
const swapTabPath = join(root, 'packages/frontend/src/app/components/tabs/SwapTab.tsx');

const addrs = JSON.parse(readFileSync(deployedPath, 'utf8'));

const chainsContent = readFileSync(chainsPath, 'utf8');
const newChains = chainsContent
  .replace(/WMON: '[^']+'/g, `WMON: '${addrs.WMON}'`)
  .replace(/USDC: '[^']+'/g, `USDC: '${addrs.USDC}'`)
  .replace(/UNISWAP_FACTORY: '[^']+'/g, `UNISWAP_FACTORY: '${addrs.Factory}'`)
  .replace(/SWAP_ROUTER: '[^']+'/g, `SWAP_ROUTER: '${addrs.SwapRouter}'`)
  .replace(/QUOTER_V2: '[^']+'/g, `QUOTER_V2: '${addrs.QuoterV2}'`)
  .replace(/POSITION_MANAGER: '[^']+'/g, `POSITION_MANAGER: '${addrs.NFPM}'`);
writeFileSync(chainsPath, newChains);
console.log('Updated', chainsPath);

const swapContent = readFileSync(swapTabPath, 'utf8');
const newSwap = swapContent
  .replace(/const SWAP_ROUTER = '[^']+'/g, `const SWAP_ROUTER = '${addrs.SwapRouter}'`)
  .replace(/const WMON = '[^']+'/g, `const WMON = '${addrs.WMON}'`)
  .replace(/const USDC_ADDR = '[^']+'/g, `const USDC_ADDR = '${addrs.USDC}'`);
writeFileSync(swapTabPath, newSwap);
console.log('Updated', swapTabPath);
