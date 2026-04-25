// E2E testnet verification — pnpm e2e:bnb | e2e:sol | e2e:all

import SafeImport from '@safe-global/protocol-kit';
import { JsonRpcProvider, formatEther } from 'ethers';
// ESM/CJS interop: Safe may resolve as { default: class } or class directly
const Safe = typeof SafeImport.init === 'function' ? SafeImport : (SafeImport as any).default;
import {
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  clusterApiUrl,
} from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import {
  loadKeys,
  loadDeployed,
  requireEvmTreasurer,
  requireSolTreasurer,
  solKeypairFromBase64,
} from './testnet-keys-loader.js';

if (process.env.NODE_ENV === 'production') {
  console.error('ERROR: Refusing to run E2E testnet script in production.');
  process.exit(1);
}

async function confirmTx(connection: Connection, sig: string): Promise<void> {
  const lbh = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature: sig, ...lbh });
}

async function airdropIfNeeded(
  connection: Connection,
  pubkey: PublicKey,
  label: string,
  minLamports = 0.05 * LAMPORTS_PER_SOL
): Promise<void> {
  const balance = await connection.getBalance(pubkey);
  if (balance >= minLamports) return;
  console.log(`  Airdropping 1 SOL to ${label} (${pubkey.toBase58()})...`);
  const sig = await connection.requestAirdrop(pubkey, LAMPORTS_PER_SOL);
  await confirmTx(connection, sig);
}

// ── BNB E2E ───────────────────────────────────────────────────────────────────

async function verifyBnb(): Promise<void> {
  console.log('\n=== E2E Verify — BNB Chapel testnet ===');
  const keys = loadKeys(import.meta.url);
  const deployed = loadDeployed(import.meta.url);

  const safeAddress = deployed.SAFE_ADDRESS_BNB_TESTNET;
  if (!safeAddress) {
    console.error('ERROR: SAFE_ADDRESS_BNB_TESTNET not found. Run: pnpm deploy:safe-bnb-testnet');
    process.exit(1);
  }

  const rpc = process.env.BNB_TESTNET_RPC ?? 'https://data-seed-prebsc-1-s1.bnbchain.org:8545';
  const provider = new JsonRpcProvider(rpc);
  const safeBalance = await provider.getBalance(safeAddress);
  console.log(`  Safe (${safeAddress}): ${formatEther(safeBalance)} tBNB`);

  if (safeBalance < BigInt('5000000000000000')) {
    console.warn('  WARNING: Safe balance below 0.005 tBNB. Run: pnpm fund:bnb');
  }

  const t0 = requireEvmTreasurer(keys, 0);
  const t1 = requireEvmTreasurer(keys, 1);
  const t2 = requireEvmTreasurer(keys, 2);

  console.log('  Step 1: Creating Safe transaction (treasurer-0)...');
  const kit0 = await Safe.init({ provider: rpc, signer: t0.privateKey, safeAddress });
  const safeTx = await kit0.createTransaction({
    transactions: [{ to: t2.address, value: '100000000000000', data: '0x' }],
  });

  console.log('  Step 2: Signing with treasurer-0...');
  const signed1 = await kit0.signTransaction(safeTx);

  console.log('  Step 3: Signing with treasurer-1...');
  const kit1 = await Safe.init({ provider: rpc, signer: t1.privateKey, safeAddress });
  const signed2 = await kit1.signTransaction(signed1);

  console.log('  Step 4: Executing transaction (treasurer-1)...');
  const execResult = await kit1.executeTransaction(signed2);
  const txHash =
    typeof execResult === 'object' && execResult !== null && 'hash' in execResult
      ? (execResult as { hash: string }).hash
      : String(execResult);

  console.log('\nSUCCESS — BNB E2E complete');
  console.log(`  TX Hash:  ${txHash}`);
  console.log(`  Explorer: https://testnet.bscscan.com/tx/${txHash}`);
}

// ── Solana E2E ────────────────────────────────────────────────────────────────

async function verifySolana(): Promise<void> {
  console.log('\n=== E2E Verify — Solana Devnet ===');
  const keys = loadKeys(import.meta.url);
  const deployed = loadDeployed(import.meta.url);

  const multisigPdaStr = deployed.SQUADS_MULTISIG_PDA_DEVNET;
  if (!multisigPdaStr) {
    console.error('ERROR: SQUADS_MULTISIG_PDA_DEVNET not found. Run: pnpm deploy:squads-devnet');
    process.exit(1);
  }

  const multisigPda = new PublicKey(multisigPdaStr);
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });
  const rpc = process.env.SOLANA_DEVNET_RPC ?? clusterApiUrl('devnet');
  const connection = new Connection(rpc, 'confirmed');

  const vaultBalance = await connection.getBalance(vaultPda);
  console.log(`  Vault (${vaultPda.toBase58()}): ${vaultBalance / LAMPORTS_PER_SOL} SOL`);
  if (vaultBalance < 0.5 * LAMPORTS_PER_SOL) {
    console.warn('  WARNING: Vault balance below 0.5 SOL. Run: pnpm fund:sol');
  }

  const t0kp = solKeypairFromBase64(requireSolTreasurer(keys, 0));
  const t1kp = solKeypairFromBase64(requireSolTreasurer(keys, 1));
  const t2pubkey = new PublicKey(requireSolTreasurer(keys, 2).publicKey);

  await airdropIfNeeded(connection, t0kp.publicKey, 'treasurer-0');
  await airdropIfNeeded(connection, t1kp.publicKey, 'treasurer-1');

  const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(connection, multisigPda);
  const newTxIndex = BigInt(multisigAccount.transactionIndex.toString()) + 1n;
  console.log(`  Current tx index: ${multisigAccount.transactionIndex} → using ${newTxIndex}`);

  console.log('  Step 1: Creating vault transaction...');
  const { blockhash } = await connection.getLatestBlockhash();
  const txMessage = new TransactionMessage({
    payerKey: vaultPda,
    recentBlockhash: blockhash,
    instructions: [SystemProgram.transfer({ fromPubkey: vaultPda, toPubkey: t2pubkey, lamports: 100_000 })],
  });
  const sig1 = await multisig.rpc.vaultTransactionCreate({
    connection, feePayer: t0kp, multisigPda, transactionIndex: newTxIndex,
    creator: t0kp.publicKey, vaultIndex: 0, ephemeralSigners: 0,
    transactionMessage: txMessage, sendOptions: { skipPreflight: true },
  });
  await confirmTx(connection, sig1);

  console.log('  Step 2: Creating proposal...');
  const sig2 = await multisig.rpc.proposalCreate({
    connection, feePayer: t0kp, multisigPda, transactionIndex: newTxIndex,
    creator: t0kp, sendOptions: { skipPreflight: true },
  });
  await confirmTx(connection, sig2);

  console.log('  Step 3: Approving with treasurer-0...');
  const sig3 = await multisig.rpc.proposalApprove({
    connection, feePayer: t0kp, member: t0kp, multisigPda,
    transactionIndex: newTxIndex, sendOptions: { skipPreflight: true },
  });
  await confirmTx(connection, sig3);

  console.log('  Step 4: Approving with treasurer-1...');
  const sig4 = await multisig.rpc.proposalApprove({
    connection, feePayer: t1kp, member: t1kp, multisigPda,
    transactionIndex: newTxIndex, sendOptions: { skipPreflight: true },
  });
  await confirmTx(connection, sig4);

  console.log('  Step 5: Executing vault transaction...');
  const execSig = await multisig.rpc.vaultTransactionExecute({
    connection, feePayer: t0kp, multisigPda, transactionIndex: newTxIndex,
    member: t0kp.publicKey, sendOptions: { skipPreflight: true },
  });

  console.log('\nSUCCESS — Solana E2E complete');
  console.log(`  TX Signature: ${execSig}`);
  console.log(`  Explorer:     https://explorer.solana.com/tx/${execSig}?cluster=devnet`);
}

// ── entry ─────────────────────────────────────────────────────────────────────

function parseChain(): 'bnb' | 'sol' | 'all' {
  const idx = process.argv.indexOf('--chain');
  const val = idx !== -1 ? process.argv[idx + 1] : undefined;
  if (val === 'bnb' || val === 'sol' || val === 'all') return val;
  console.error('ERROR: --chain bnb|sol|all is required');
  process.exit(1);
}

const chain = parseChain();

try {
  if (chain === 'bnb' || chain === 'all') await verifyBnb();
  if (chain === 'sol' || chain === 'all') await verifySolana();
} catch (err) {
  console.error('\nERROR:', (err as Error).message);
  process.exit(1);
}
