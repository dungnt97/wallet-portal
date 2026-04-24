/**
 * deploy-squads-devnet.ts
 *
 * Creates a Squads v4 Multisig PDA on Solana Devnet.
 * threshold: 2-of-3 members, time_lock: 0.
 *
 * Prerequisites:
 *   1. Copy .env.example → .env and fill DEPLOYER_KEYPAIR_PATH + TREASURER_PUBKEYS
 *   2. Ensure deployer has at least 0.1 SOL (script requests airdrop if balance < 0.05 SOL)
 *   3. Run: pnpm deploy:squads-devnet
 *
 * Output: multisig PDA + vault PDA logged + appended to .deployed.json
 */

import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, clusterApiUrl } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';

// ── env validation ────────────────────────────────────────────────────────────

const DEPLOYER_KEYPAIR_PATH = process.env.DEPLOYER_KEYPAIR_PATH;
const TREASURER_PUBKEYS_RAW = process.env.TREASURER_PUBKEYS;

if (!DEPLOYER_KEYPAIR_PATH) {
  console.error('ERROR: DEPLOYER_KEYPAIR_PATH is not set in .env');
  console.error('  Tip: solana-keygen new -o ~/.config/solana/deployer.json');
  process.exit(1);
}

if (!TREASURER_PUBKEYS_RAW) {
  console.error('ERROR: TREASURER_PUBKEYS is not set in .env (comma-separated, 3 pubkeys)');
  process.exit(1);
}

const memberPubkeys = TREASURER_PUBKEYS_RAW.split(',')
  .map((k) => k.trim())
  .filter(Boolean);

if (memberPubkeys.length !== 3) {
  console.error(`ERROR: Expected exactly 3 TREASURER_PUBKEYS, got ${memberPubkeys.length}`);
  process.exit(1);
}

// ── helpers ───────────────────────────────────────────────────────────────────

const SOLANA_DEVNET_RPC = process.env.SOLANA_DEVNET_RPC ?? clusterApiUrl('devnet');

function loadKeypair(keypairPath: string): Keypair {
  const raw = readFileSync(keypairPath, 'utf8');
  const secretKey = Uint8Array.from(JSON.parse(raw) as number[]);
  return Keypair.fromSecretKey(secretKey);
}

async function ensureFunded(
  connection: Connection,
  keypair: Keypair,
  minLamports = 0.05 * LAMPORTS_PER_SOL
): Promise<void> {
  const balance = await connection.getBalance(keypair.publicKey);
  console.log(
    `  Deployer balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL (${keypair.publicKey.toBase58()})`
  );

  if (balance < minLamports) {
    console.log('  Balance low — requesting airdrop of 2 SOL...');
    const sig = await connection.requestAirdrop(keypair.publicKey, 2 * LAMPORTS_PER_SOL);
    const latestBlockhash = await connection.getLatestBlockhash();
    await connection.confirmTransaction({ signature: sig, ...latestBlockhash });
    const newBalance = await connection.getBalance(keypair.publicKey);
    console.log(
      `  Airdrop confirmed. New balance: ${(newBalance / LAMPORTS_PER_SOL).toFixed(4)} SOL`
    );
  }
}

function appendDeployed(updates: Record<string, string>): void {
  const deployedPath = new URL('../.deployed.json', import.meta.url).pathname;
  const existing: Record<string, string> = existsSync(deployedPath)
    ? (JSON.parse(readFileSync(deployedPath, 'utf8')) as Record<string, string>)
    : {};
  Object.assign(existing, updates);
  existing._updatedAt = new Date().toISOString();
  writeFileSync(deployedPath, `${JSON.stringify(existing, null, 2)}\n`);
  for (const [k, v] of Object.entries(updates)) {
    console.log(`  Appended to .deployed.json: ${k}=${v}`);
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

console.log('=== Deploy Squads v4 Multisig — Solana Devnet ===');
console.log(`  RPC:       ${SOLANA_DEVNET_RPC}`);
console.log(`  Members:   ${memberPubkeys.join(', ')}`);
console.log(`  Threshold: 2 of ${memberPubkeys.length}`);

const connection = new Connection(SOLANA_DEVNET_RPC, 'confirmed');
const deployer = loadKeypair(DEPLOYER_KEYPAIR_PATH);

await ensureFunded(connection, deployer);

// Fetch the Squads program config to get the required treasury address
const [programConfigPda] = multisig.getProgramConfigPda({});
console.log(`  Program Config PDA: ${programConfigPda.toBase58()}`);

const programConfig = await multisig.accounts.ProgramConfig.fromAccountAddress(
  connection,
  programConfigPda
);
console.log(`  Program Treasury:   ${programConfig.treasury.toBase58()}`);

// Unique createKey — use deployer pubkey + timestamp for determinism across redeploys
const createKey = Keypair.generate();

const [multisigPda] = multisig.getMultisigPda({ createKey: createKey.publicKey });
const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });

const members: multisig.types.Member[] = memberPubkeys.map((pk) => ({
  key: new PublicKey(pk),
  permissions: multisig.types.Permissions.all(),
}));

console.log('  Creating multisig PDA...');

const signature = await multisig.rpc.multisigCreateV2({
  connection,
  creator: deployer,
  multisigPda,
  configAuthority: null,
  threshold: 2,
  members,
  timeLock: 0,
  createKey,
  treasury: programConfig.treasury,
  rentCollector: null,
  sendOptions: { skipPreflight: false },
});

console.log(`  Transaction signature: ${signature}`);
console.log('');
console.log('SUCCESS — Squads Multisig deployed');
console.log(`  Multisig PDA: ${multisigPda.toBase58()}`);
console.log(`  Vault PDA:    ${vaultPda.toBase58()}`);
console.log('');
console.log('Next steps:');
console.log('  1. Copy Multisig PDA to apps/ui/.env → VITE_SQUADS_MULTISIG_PDA_DEVNET');
console.log('  2. Copy Multisig PDA to apps/admin-api/.env → SQUADS_MULTISIG_PDA_DEVNET');
console.log('  3. Copy Multisig PDA to apps/wallet-engine/.env → SQUADS_MULTISIG_PDA_DEVNET');

appendDeployed({
  SQUADS_MULTISIG_PDA_DEVNET: multisigPda.toBase58(),
  SQUADS_VAULT_PDA_DEVNET: vaultPda.toBase58(),
});
