// BullMQ withdrawal_execute worker — builds + broadcasts Safe/Squads tx, then
// calls admin-api internal endpoints to record broadcast + confirmation.
//
// Dev-mode path (AUTH_DEV_MODE=true):
//   Synthesises a fake tx hash and skips real on-chain broadcast.
//   This path must never crash so smoke tests pass without deployed contracts.
//
// Production path:
//   EVM: reads collected signatures from admin-api, executes Safe tx via
//        protocol-kit executeTransaction once threshold is met.
//   SOL: throws FATAL if SQUADS_MULTISIG_ADDRESS unset; executes Squads
//        proposalExecute instruction via @sqds/multisig.
//   Missing required env in prod → throws FATAL, job enters BullMQ failed state.
import { Worker } from 'bullmq';
import type IORedis from 'ioredis';
import pino from 'pino';
import type { AppConfig } from '../../config/env.js';
import { makeDb } from '../../db/client.js';
import type { AdminApiClientOptions } from '../../services/admin-api-client.js';
import { isKillSwitchEnabled } from '../../services/kill-switch-db-query.js';
import { WITHDRAWAL_EXECUTE_QUEUE_NAME } from '../withdrawal-execute.js';
import type { WithdrawalExecuteJobData } from '../withdrawal-execute.js';
import { startHeartbeat } from '../worker-heartbeat.js';

const logger = pino({ name: 'withdrawal-execute-worker' });

// ── Dev-mode detection ────────────────────────────────────────────────────────

function isDevMode(): boolean {
  return process.env.AUTH_DEV_MODE === 'true';
}

/** Synthesise a fake 32-byte hex tx hash for dev/test environments only */
function syntheticTxHash(): string {
  const bytes = Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, '0')
  );
  return `0x${bytes.join('')}`;
}

// ── Admin-api internal callers ────────────────────────────────────────────────

async function callBroadcasted(
  opts: AdminApiClientOptions,
  withdrawalId: string,
  txHash: string
): Promise<void> {
  const url = `${opts.baseUrl}/internal/withdrawals/${encodeURIComponent(withdrawalId)}/broadcasted`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.bearerToken}`,
    },
    body: JSON.stringify({ txHash }),
  });
  if (!res.ok) {
    throw new Error(`POST /internal/withdrawals/${withdrawalId}/broadcasted → ${res.status}`);
  }
}

async function callConfirmed(opts: AdminApiClientOptions, withdrawalId: string): Promise<void> {
  const url = `${opts.baseUrl}/internal/withdrawals/${encodeURIComponent(withdrawalId)}/confirmed`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.bearerToken}`,
    },
  });
  if (!res.ok) {
    throw new Error(`POST /internal/withdrawals/${withdrawalId}/confirmed → ${res.status}`);
  }
}

// ── Fetch collected signatures from admin-api ─────────────────────────────────

interface CollectedSig {
  signer: string;
  signature: string;
}

async function fetchCollectedSignatures(
  opts: AdminApiClientOptions,
  withdrawalId: string
): Promise<CollectedSig[]> {
  const url = `${opts.baseUrl}/internal/withdrawals/${encodeURIComponent(withdrawalId)}/signatures`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${opts.bearerToken}` },
  });
  if (!res.ok) {
    throw new Error(`GET /internal/withdrawals/${withdrawalId}/signatures → ${res.status}`);
  }
  const body = (await res.json()) as { signatures: CollectedSig[] };
  return body.signatures;
}

// ── EVM Safe broadcast via ethers + raw Safe execTransaction ABI ─────────────
// wallet-engine depends only on ethers; protocol-kit lives in the UI.
// We call Safe.execTransaction directly with the collected EIP-712 signatures
// packed in the Safe signature format.

// Safe v1.4.1 execTransaction ABI fragment
const SAFE_EXEC_ABI = [
  'function execTransaction(address to, uint256 value, bytes calldata data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address payable refundReceiver, bytes memory signatures) public payable returns (bool success)',
  'function nonce() public view returns (uint256)',
  'function getTransactionHash(address to, uint256 value, bytes calldata data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address payable refundReceiver, uint256 _nonce) public view returns (bytes32)',
];

const ERC20_TRANSFER_ABI = ['function transfer(address to, uint256 amount) returns (bool)'];

/**
 * Pack EIP-712 signatures into the Safe execTransaction `signatures` bytes.
 * Each signature is 65 bytes: r (32) + s (32) + v (1).
 * Signatures must be sorted ascending by signer address (Safe requirement).
 */
function packSafeSignatures(sigs: CollectedSig[]): string {
  const sorted = [...sigs].sort((a, b) =>
    a.signer.toLowerCase().localeCompare(b.signer.toLowerCase())
  );
  return `0x${sorted.map((s) => s.signature.replace(/^0x/, '')).join('')}`;
}

async function broadcastEvmSafe(
  withdrawalId: string,
  token: string,
  amount: string,
  destinationAddr: string,
  collectedSigs: CollectedSig[]
): Promise<string> {
  const safeAddress = process.env.SAFE_ADDRESS;
  if (!safeAddress) {
    throw new Error('[withdrawal-execute] FATAL: SAFE_ADDRESS env not set in production');
  }

  const rpcUrl = process.env.BNB_RPC_URL;
  if (!rpcUrl) {
    throw new Error('[withdrawal-execute] FATAL: BNB_RPC_URL env not set in production');
  }

  const executorKey = process.env.WALLET_ENGINE_EXECUTOR_KEY;
  if (!executorKey) {
    throw new Error(
      '[withdrawal-execute] FATAL: WALLET_ENGINE_EXECUTOR_KEY env not set in production'
    );
  }

  const tokenAddress =
    token === 'USDT' ? process.env.BNB_USDT_ADDRESS : process.env.BNB_USDC_ADDRESS;

  if (!tokenAddress) {
    throw new Error(`[withdrawal-execute] FATAL: BNB_${token}_ADDRESS env not set in production`);
  }

  const { ethers, Interface } = await import('ethers');
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(executorKey, provider);

  const safeContract = new ethers.Contract(safeAddress, SAFE_EXEC_ABI, signer);
  const erc20Iface = new Interface(ERC20_TRANSFER_ABI);

  // Build ERC-20 transfer calldata (USDT/USDC = 6 decimals)
  const amountWei = ethers.parseUnits(amount, 6);
  const txData = erc20Iface.encodeFunctionData('transfer', [destinationAddr, amountWei]);

  // Pack signatures sorted by signer address (Safe requirement)
  const packedSigs = packSafeSignatures(collectedSigs);

  logger.info({ withdrawalId, safeAddress, tokenAddress }, 'Calling Safe.execTransaction');

  // Cast execTransaction to a typed callable — ethers dynamic ABI lookup is untyped.
  const execFn = safeContract.execTransaction as (
    ...args: unknown[]
  ) => Promise<{ wait(): Promise<{ hash: string; blockNumber: number } | null> }>;
  const txResponse = await execFn(
    tokenAddress, // to
    0n, // value (0 for ERC-20)
    txData, // data
    0, // operation (Call)
    0n, // safeTxGas
    0n, // baseGas
    0n, // gasPrice
    ethers.ZeroAddress, // gasToken
    ethers.ZeroAddress, // refundReceiver
    packedSigs // signatures
  );

  const receipt = await txResponse.wait();
  if (!receipt) {
    throw new Error('[withdrawal-execute] execTransaction returned no receipt');
  }

  logger.info(
    { withdrawalId, txHash: receipt.hash, blockNumber: receipt.blockNumber },
    'EVM Safe execTransaction confirmed'
  );
  return receipt.hash;
}

// ── Solana Squads broadcast ───────────────────────────────────────────────────

async function broadcastSolanaSquads(
  withdrawalId: string,
  token: string,
  amount: string,
  destinationAddr: string
): Promise<string> {
  const multisigAddr = process.env.SQUADS_MULTISIG_ADDRESS;
  if (!multisigAddr) {
    throw new Error(
      '[withdrawal-execute] FATAL: SQUADS_MULTISIG_ADDRESS env not set in production'
    );
  }

  const rpcUrl = process.env.SOL_RPC_URL;
  if (!rpcUrl) {
    throw new Error('[withdrawal-execute] FATAL: SOL_RPC_URL env not set in production');
  }

  const payerKey = process.env.WALLET_ENGINE_SOL_PAYER_KEY;
  if (!payerKey) {
    throw new Error(
      '[withdrawal-execute] FATAL: WALLET_ENGINE_SOL_PAYER_KEY env not set in production'
    );
  }

  const {
    Connection,
    Keypair,
    PublicKey,
    SystemProgram,
    TransactionMessage,
    VersionedTransaction,
  } = await import('@solana/web3.js');
  const multisig = await import('@sqds/multisig');

  const connection = new Connection(rpcUrl, 'confirmed');
  const payerKeypair = Keypair.fromSecretKey(Buffer.from(payerKey, 'base64'));
  const multisigPda = new PublicKey(multisigAddr);

  // Load multisig to find the latest executed transaction index for proposalExecute
  const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(
    connection,
    multisigPda
  );
  const transactionIndex = BigInt(
    typeof multisigAccount.transactionIndex === 'bigint'
      ? multisigAccount.transactionIndex
      : (multisigAccount.transactionIndex as { toNumber(): number }).toNumber()
  );

  // Execute the pending proposal at current transactionIndex.
  // vaultTransactionExecute returns { instruction, lookupTableAccounts }.
  const executeResult = await multisig.instructions.vaultTransactionExecute({
    connection,
    multisigPda,
    transactionIndex,
    member: payerKeypair.publicKey,
  });
  const executeIx = executeResult.instruction;
  const lookupTableAccounts = executeResult.lookupTableAccounts ?? [];

  const { blockhash } = await connection.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: payerKeypair.publicKey,
    recentBlockhash: blockhash,
    instructions: [executeIx],
  }).compileToV0Message(lookupTableAccounts);

  const tx = new VersionedTransaction(message);
  tx.sign([payerKeypair]);

  const signature = await connection.sendTransaction(tx);
  await connection.confirmTransaction(signature, 'confirmed');

  logger.info({ withdrawalId, signature }, 'Solana Squads vault transaction executed');
  return signature;
}

// ── Worker factory ────────────────────────────────────────────────────────────

export function startWithdrawalExecuteWorker(redis: IORedis, cfg: AppConfig): Worker {
  const adminOpts: AdminApiClientOptions = {
    baseUrl: cfg.ADMIN_API_BASE_URL,
    bearerToken: cfg.SVC_BEARER_TOKEN,
  };

  // Shared DB client for kill-switch checks — one pool per worker process
  const db = makeDb(cfg.DATABASE_URL);

  // Heartbeat writer — health endpoint reads worker:withdrawal-execute:heartbeat
  const stopHeartbeat = startHeartbeat(redis, 'withdrawal-execute');

  const worker = new Worker<WithdrawalExecuteJobData>(
    WITHDRAWAL_EXECUTE_QUEUE_NAME,
    async (job) => {
      const { withdrawalId, chain, token, amount, destinationAddr } = job.data;
      logger.info({ jobId: job.id, withdrawalId, chain }, 'Processing withdrawal_execute job');

      // Kill-switch guard — requeue with 30s delay; do NOT drop the job
      if (await isKillSwitchEnabled(db)) {
        logger.warn(
          { withdrawalId, jobId: job.id },
          'paused_by_killswitch — requeueing with 30s delay'
        );
        await job.moveToDelayed(Date.now() + 30_000);
        return;
      }

      let txHash: string;

      if (isDevMode()) {
        // ── Dev / smoke-test path ──────────────────────────────────────────────
        txHash = syntheticTxHash();
        logger.warn(
          { withdrawalId, txHash, chain },
          'DEV MODE: synthetic tx hash generated — no real broadcast'
        );
      } else {
        // ── Production path ────────────────────────────────────────────────────
        // Fetch collected signatures from admin-api for threshold check
        const collectedSigs = await fetchCollectedSignatures(adminOpts, withdrawalId);

        if (chain === 'bnb') {
          txHash = await broadcastEvmSafe(
            withdrawalId,
            token,
            amount,
            destinationAddr,
            collectedSigs
          );
        } else if (chain === 'sol') {
          txHash = await broadcastSolanaSquads(withdrawalId, token, amount, destinationAddr);
        } else {
          throw new Error(`[withdrawal-execute] Unknown chain: ${chain}`);
        }
      }

      // Signal admin-api: broadcast recorded
      await callBroadcasted(adminOpts, withdrawalId, txHash);
      logger.info({ withdrawalId, txHash }, 'Broadcast recorded in admin-api');

      // Dev-mode: call /confirmed immediately so UI updates without block watcher
      if (isDevMode()) {
        await new Promise<void>((resolve) => setTimeout(resolve, 500));
        await callConfirmed(adminOpts, withdrawalId);
        logger.info({ withdrawalId }, 'Confirmation recorded in admin-api (dev-mode immediate)');
      }
      // Production: block watcher calls /confirmed after N confirmations
    },
    {
      connection: redis,
      concurrency: 3,
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'withdrawal_execute job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'withdrawal_execute job failed');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'withdrawal_execute worker error');
  });

  // Stop heartbeat when worker closes
  worker.on('closing', () => stopHeartbeat());

  return worker;
}
