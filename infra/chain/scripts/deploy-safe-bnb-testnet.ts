/**
 * deploy-safe-bnb-testnet.ts
 *
 * Deploys a Safe v1.4.1 multisig on BNB Chapel testnet (chainId 97).
 * threshold: 2-of-3 owners. Uses @safe-global/protocol-kit v5 API.
 *
 * Prerequisites:
 *   1. Copy .env.example → .env, fill DEPLOYER_PRIVATE_KEY + TREASURER_ADDRESSES
 *   2. Fund deployer address with at least 0.05 tBNB:
 *      https://testnet.bnbchain.org/faucet-smart
 *   3. Run: pnpm deploy:safe-bnb-testnet
 *
 * Output: deployed Safe address logged + appended to .deployed.json
 */

import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import Safe from '@safe-global/protocol-kit';
import type { PredictedSafeProps, SafeAccountConfig } from '@safe-global/protocol-kit';
// Safe class instance type — default export is the class itself
type SafeInstance = InstanceType<typeof Safe>;
import { JsonRpcProvider, Wallet } from 'ethers';

// ── env validation ────────────────────────────────────────────────────────────

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const TREASURER_ADDRESSES_RAW = process.env.TREASURER_ADDRESSES;

if (!DEPLOYER_PRIVATE_KEY) {
  console.error('ERROR: DEPLOYER_PRIVATE_KEY is not set in .env');
  process.exit(1);
}

if (!TREASURER_ADDRESSES_RAW) {
  console.error('ERROR: TREASURER_ADDRESSES is not set in .env (comma-separated, 3 addresses)');
  process.exit(1);
}

const owners = TREASURER_ADDRESSES_RAW.split(',')
  .map((a) => a.trim())
  .filter(Boolean);

if (owners.length !== 3) {
  console.error(`ERROR: Expected exactly 3 TREASURER_ADDRESSES, got ${owners.length}`);
  process.exit(1);
}

// ── config ────────────────────────────────────────────────────────────────────

const BNB_CHAPEL_RPC =
  process.env.BNB_TESTNET_RPC ?? 'https://data-seed-prebsc-1-s1.bnbchain.org:8545';

const MAX_RETRIES = 3;

// ── helpers ───────────────────────────────────────────────────────────────────

async function sendDeployTxWithRetry(
  safeSdk: SafeInstance,
  wallet: Wallet,
  attempt = 1
): Promise<string> {
  try {
    console.log(`  Attempt ${attempt}/${MAX_RETRIES} — sending deploy tx...`);

    // protocol-kit v5: createSafeDeploymentTransaction returns a raw tx object
    const deployTx = await safeSdk.createSafeDeploymentTransaction();

    const response = await wallet.sendTransaction({
      to: deployTx.to,
      value: BigInt(deployTx.value ?? 0),
      data: deployTx.data,
    });

    console.log(`  TX submitted: ${response.hash}`);
    console.log('  Waiting for confirmation (1 block)...');
    await response.wait(1);
    console.log('  Confirmed.');
    return response.hash;
  } catch (err) {
    if (attempt >= MAX_RETRIES) throw err;
    const waitMs = attempt * 3000;
    console.warn(`  Attempt ${attempt} failed: ${(err as Error).message}`);
    console.warn(`  Retrying in ${waitMs / 1000}s...`);
    await new Promise((r) => setTimeout(r, waitMs));
    return sendDeployTxWithRetry(safeSdk, wallet, attempt + 1);
  }
}

function appendDeployed(key: string, value: string): void {
  const deployedPath = new URL('../.deployed.json', import.meta.url).pathname;
  const existing: Record<string, string> = existsSync(deployedPath)
    ? (JSON.parse(readFileSync(deployedPath, 'utf8')) as Record<string, string>)
    : {};
  existing[key] = value;
  existing._updatedAt = new Date().toISOString();
  writeFileSync(deployedPath, `${JSON.stringify(existing, null, 2)}\n`);
  console.log(`  Appended to .deployed.json: ${key}=${value}`);
}

// ── main ──────────────────────────────────────────────────────────────────────

console.log('=== Deploy Safe v1.4.1 — BNB Chapel testnet (chainId 97) ===');
console.log(`  RPC:       ${BNB_CHAPEL_RPC}`);
console.log(`  Owners:    ${owners.join(', ')}`);
console.log(`  Threshold: 2 of ${owners.length}`);

const safeAccountConfig: SafeAccountConfig = { owners, threshold: 2 };
const predictedSafe: PredictedSafeProps = { safeAccountConfig };

// Safe.init with predictedSafe config — predicts address without deploying
const safeSdk = await Safe.init({
  provider: BNB_CHAPEL_RPC,
  signer: DEPLOYER_PRIVATE_KEY,
  predictedSafe,
});

const predictedAddress = await safeSdk.getAddress();
const alreadyDeployed = await safeSdk.isSafeDeployed();

if (alreadyDeployed) {
  console.log(`\nSafe already deployed at ${predictedAddress} — nothing to do.`);
  appendDeployed('SAFE_ADDRESS_BNB_TESTNET', predictedAddress);
  process.exit(0);
}

console.log(`  Predicted Safe address: ${predictedAddress}`);

// Use ethers Wallet for sending the raw deploy tx (no Safe account yet)
const provider = new JsonRpcProvider(BNB_CHAPEL_RPC);
const wallet = new Wallet(DEPLOYER_PRIVATE_KEY, provider);

await sendDeployTxWithRetry(safeSdk, wallet);

console.log('');
console.log(`SUCCESS — Safe deployed at: ${predictedAddress}`);
console.log('');
console.log('Next steps:');
console.log('  1. Copy Safe address to apps/ui/.env       → VITE_SAFE_ADDRESS_BNB_TESTNET');
console.log('  2. Copy Safe address to apps/admin-api/.env → SAFE_ADDRESS_BNB_TESTNET');
console.log('  3. Copy Safe address to apps/wallet-engine/.env → SAFE_ADDRESS_BNB_TESTNET');

appendDeployed('SAFE_ADDRESS_BNB_TESTNET', predictedAddress);
