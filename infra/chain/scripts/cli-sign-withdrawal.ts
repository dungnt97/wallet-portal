/**
 * cli-sign-withdrawal.ts
 *
 * Headless multisig signing CLI:
 *   BNB path  — off-chain Safe EIP-712 signature (protocol-kit v5)
 *   Solana path — on-chain Squads proposal approval (@sqds/multisig rpc)
 *
 * Usage:
 *   pnpm sign --chain bnb [--key-index 0]
 *   pnpm sign --chain sol --tx-index N [--key-index 0]
 */

import { Connection, Keypair, PublicKey, clusterApiUrl } from '@solana/web3.js';
import SafeImport from '@safe-global/protocol-kit';
import type { EthSafeTransaction } from '@safe-global/protocol-kit';
const Safe = typeof SafeImport.init === 'function' ? SafeImport : (SafeImport as any).default;
import * as multisig from '@sqds/multisig';
import { loadKeys, loadDeployed, validateKeyIndex } from './testnet-keys-loader.js';

export interface BnbSignResult {
  safeTxHash: string;
  signer: string;
  signatureHex: string;
  signedTx: EthSafeTransaction;
}

export interface SolApproveResult {
  signer: string;
  txSignature: string;
}

// ── BNB path ──────────────────────────────────────────────────────────────────

export async function signBnbWithdrawal(keyIndex: number): Promise<BnbSignResult> {
  const keys = loadKeys(import.meta.url);
  const deployed = loadDeployed(import.meta.url);

  const treasurer = keys.evm.treasurers[keyIndex];
  if (!treasurer) {
    console.error(`ERROR: No EVM treasurer at index ${keyIndex}`);
    process.exit(1);
  }

  const safeAddress = deployed.SAFE_ADDRESS_BNB_TESTNET;
  if (!safeAddress) {
    console.error('ERROR: SAFE_ADDRESS_BNB_TESTNET not found. Run: pnpm deploy:safe-bnb-testnet');
    process.exit(1);
  }

  const rpc = process.env.BNB_TESTNET_RPC ?? 'https://data-seed-prebsc-1-s1.bnbchain.org:8545';

  console.log(`Chain:   BNB Testnet (Chapel)`);
  console.log(`RPC:     ${rpc}`);
  console.log(`Safe:    ${safeAddress}`);
  console.log(`Signer:  treasurer-${keyIndex} (${treasurer.address})`);

  const protocolKit = await Safe.init({
    provider: rpc,
    signer: treasurer.privateKey,
    safeAddress,
  });

  const safeTx = await protocolKit.createTransaction({
    transactions: [{ to: treasurer.address, value: '1000000000000000', data: '0x' }],
  });

  const safeTxHash = await protocolKit.getTransactionHash(safeTx);
  const signedTx = await protocolKit.signTransaction(safeTx);

  const sig = signedTx.signatures.get(treasurer.address.toLowerCase());
  const signatureHex = sig?.data ?? '';

  console.log('');
  console.log(`Safe TX Hash: ${safeTxHash}`);
  console.log(`Signer:       ${treasurer.address}`);
  console.log(`Signature:    ${signatureHex}`);

  return { safeTxHash, signer: treasurer.address, signatureHex, signedTx };
}

// ── Solana path ───────────────────────────────────────────────────────────────

export async function approveSolWithdrawal(
  keyIndex: number,
  txIndex: number
): Promise<SolApproveResult> {
  const keys = loadKeys(import.meta.url);
  const deployed = loadDeployed(import.meta.url);

  const treasurerRaw = keys.sol.treasurers[keyIndex];
  if (!treasurerRaw) {
    console.error(`ERROR: No Solana treasurer at index ${keyIndex}`);
    process.exit(1);
  }

  const multisigPdaStr = deployed.SQUADS_MULTISIG_PDA_DEVNET;
  if (!multisigPdaStr) {
    console.error('ERROR: SQUADS_MULTISIG_PDA_DEVNET not found. Run: pnpm deploy:squads-devnet');
    process.exit(1);
  }

  const memberKeypair = Keypair.fromSecretKey(Buffer.from(treasurerRaw.secretKey, 'base64'));
  const multisigPda = new PublicKey(multisigPdaStr);
  const rpc = process.env.SOLANA_DEVNET_RPC ?? clusterApiUrl('devnet');
  const connection = new Connection(rpc, 'confirmed');

  console.log(`Chain:    Solana Devnet`);
  console.log(`RPC:      ${rpc}`);
  console.log(`Multisig: ${multisigPdaStr}`);
  console.log(`Signer:   treasurer-${keyIndex} (${memberKeypair.publicKey.toBase58()})`);
  console.log(`TX Index: ${txIndex}`);

  const signature = await multisig.rpc.proposalApprove({
    connection,
    feePayer: memberKeypair,
    member: memberKeypair,
    multisigPda,
    transactionIndex: BigInt(txIndex),
    sendOptions: { skipPreflight: false },
  });

  console.log('');
  console.log(`Approved by treasurer-${keyIndex} (${memberKeypair.publicKey.toBase58()}), tx: ${signature}`);

  return { signer: memberKeypair.publicKey.toBase58(), txSignature: signature };
}

// ── CLI entry ─────────────────────────────────────────────────────────────────

function parseArgs(): { chain: string; keyIndex: number; txIndex: number | undefined } {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };

  const chain = get('--chain');
  if (!chain || !['bnb', 'sol'].includes(chain)) {
    console.error('ERROR: --chain bnb|sol is required');
    process.exit(1);
  }

  const keyIndex = validateKeyIndex(get('--key-index'));
  const txIndexRaw = get('--tx-index');
  const txIndex = txIndexRaw !== undefined ? parseInt(txIndexRaw, 10) : undefined;

  if (chain === 'sol' && txIndex === undefined) {
    console.error('ERROR: Squads requires --tx-index');
    process.exit(1);
  }

  return { chain, keyIndex, txIndex };
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const { chain, keyIndex, txIndex } = parseArgs();

  try {
    if (chain === 'bnb') {
      await signBnbWithdrawal(keyIndex);
    } else {
      await approveSolWithdrawal(keyIndex, txIndex!);
    }
  } catch (err) {
    console.error('ERROR:', (err as Error).message);
    process.exit(1);
  }
}
