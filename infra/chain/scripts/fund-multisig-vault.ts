import { existsSync, readFileSync } from 'node:fs';
import { JsonRpcProvider, Wallet, formatEther, parseEther } from 'ethers';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

const KEYS_PATH = new URL('../.testnet-keys.json', import.meta.url).pathname;
const DEPLOYED_PATH = new URL('../.deployed.json', import.meta.url).pathname;

function loadKeysFile(): ReturnType<typeof JSON.parse> {
  if (!existsSync(KEYS_PATH)) {
    console.error('ERROR: .testnet-keys.json not found. Run `pnpm keygen` first.');
    process.exit(1);
  }
  return JSON.parse(readFileSync(KEYS_PATH, 'utf8'));
}

function loadDeployedFile(): Record<string, string> {
  if (!existsSync(DEPLOYED_PATH)) {
    console.error('ERROR: .deployed.json not found. Run a deploy script first (e.g. pnpm deploy:safe-bnb-testnet).');
    process.exit(1);
  }
  return JSON.parse(readFileSync(DEPLOYED_PATH, 'utf8')) as Record<string, string>;
}

function requireDeployedKey(deployed: Record<string, string>, key: string): string {
  const value = deployed[key];
  if (!value) {
    console.error(`ERROR: Key "${key}" not found in .deployed.json. Run the corresponding deploy script first.`);
    process.exit(1);
  }
  return value;
}

async function fundBnb(): Promise<void> {
  console.log('=== Fund Safe multisig — BNB Chapel testnet ===');

  const keys = loadKeysFile();
  const deployed = loadDeployedFile();

  const deployerKey: string = keys.evm.deployer.privateKey;
  const safeAddress = requireDeployedKey(deployed, 'SAFE_ADDRESS_BNB_TESTNET');

  const rpc = process.env.BNB_TESTNET_RPC ?? 'https://data-seed-prebsc-1-s1.bnbchain.org:8545';
  const provider = new JsonRpcProvider(rpc);
  const wallet = new Wallet(deployerKey, provider);

  const deployerBalance = await provider.getBalance(wallet.address);
  console.log(`  Deployer (${wallet.address}): ${formatEther(deployerBalance)} tBNB`);

  const safeBalanceBefore = await provider.getBalance(safeAddress);
  console.log(`  Safe (${safeAddress}): ${formatEther(safeBalanceBefore)} tBNB`);

  const amount = parseEther('0.003');
  console.log(`\n  Transferring 0.003 tBNB to Safe...`);

  const tx = await wallet.sendTransaction({ to: safeAddress, value: amount });
  console.log(`  TX submitted: ${tx.hash}`);
  console.log('  Waiting for confirmation...');
  await tx.wait(1);
  console.log('  Confirmed.');

  const safeBalanceAfter = await provider.getBalance(safeAddress);
  console.log(`\n  Safe new balance: ${formatEther(safeBalanceAfter)} tBNB`);
  console.log('Done.');
}

async function fundSol(): Promise<void> {
  console.log('=== Fund Squads vault — Solana devnet ===');

  const deployed = loadDeployedFile();
  const vaultPdaStr = requireDeployedKey(deployed, 'SQUADS_VAULT_PDA_DEVNET');
  const vaultPda = new PublicKey(vaultPdaStr);

  const rpc = process.env.SOLANA_DEVNET_RPC ?? 'https://api.devnet.solana.com';
  const connection = new Connection(rpc, 'confirmed');

  const balanceBefore = await connection.getBalance(vaultPda);
  console.log(`  Vault (${vaultPdaStr}): ${balanceBefore / LAMPORTS_PER_SOL} SOL`);

  console.log('\n  Requesting airdrop of 2 SOL...');
  const sig = await connection.requestAirdrop(vaultPda, 2 * LAMPORTS_PER_SOL);
  const latestBlockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature: sig, ...latestBlockhash });
  console.log(`  Airdrop confirmed: ${sig}`);

  const balanceAfter = await connection.getBalance(vaultPda);
  console.log(`\n  Vault new balance: ${balanceAfter / LAMPORTS_PER_SOL} SOL`);
  console.log('Done.');
}

const chain = process.argv.find((_, i) => process.argv[i - 1] === '--chain');

if (chain === 'bnb') {
  await fundBnb();
} else if (chain === 'sol') {
  await fundSol();
} else {
  console.error('ERROR: --chain must be "bnb" or "sol"');
  console.error('Usage: pnpm fund:bnb | pnpm fund:sol');
  process.exit(1);
}
