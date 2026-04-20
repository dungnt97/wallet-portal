// Deposit detector — per-block orchestrator: scan logs → insert deposit row → enqueue job
// BNB: uses getLogs for ERC-20 Transfer events to watched addresses
// Solana: skeleton only in this phase — full SPL parsing in Phase 09
import type { FallbackProvider, Log } from 'ethers';
import { AbiCoder, id as ethersId } from 'ethers';
import pino from 'pino';
import type { Db } from '../db/client.js';
import { enqueueDepositConfirm } from '../queue/deposit-confirm.js';
import type { Queue } from 'bullmq';

const logger = pino({ name: 'deposit-detector' });

// ERC-20 Transfer(address,address,uint256) topic
const TRANSFER_TOPIC = ethersId('Transfer(address,address,uint256)');

export interface ParsedTransfer {
  from: string;
  to: string;
  /** Raw BigInt amount (token's smallest unit) */
  amount: bigint;
  txHash: string;
  blockNumber: number;
  token: 'USDT' | 'USDC';
}

/** Parse a single ERC-20 Transfer log into a structured transfer */
export function parseBnbTransferLog(
  log: Log,
  usdtAddress: string,
  usdcAddress: string,
): ParsedTransfer | null {
  if (log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC.toLowerCase()) return null;
  if (log.topics.length < 3) return null;

  const contractAddr = log.address.toLowerCase();
  let token: 'USDT' | 'USDC';
  if (contractAddr === usdtAddress.toLowerCase()) {
    token = 'USDT';
  } else if (contractAddr === usdcAddress.toLowerCase()) {
    token = 'USDC';
  } else {
    return null;
  }

  // topics[1] = from (padded), topics[2] = to (padded), data = amount
  const from = '0x' + (log.topics[1] ?? '').slice(-40);
  const to = '0x' + (log.topics[2] ?? '').slice(-40);
  const amount = BigInt(log.data);

  return {
    from,
    to,
    amount,
    txHash: log.transactionHash,
    blockNumber: log.blockNumber,
    token,
  };
}

/** Scan a BNB block range for USDT/USDC transfers to watched addresses, persist and enqueue */
export async function detectBnbDeposits(
  provider: FallbackProvider,
  db: Db,
  queue: Queue,
  fromBlock: number,
  toBlock: number,
  watchedAddresses: Map<string, string>, // address (lowercase) → userId
  usdtAddress: string,
  usdcAddress: string,
): Promise<void> {
  if (watchedAddresses.size === 0) return;

  let logs: Log[];
  try {
    logs = await provider.getLogs({
      fromBlock,
      toBlock,
      topics: [TRANSFER_TOPIC],
      address: [usdtAddress, usdcAddress],
    });
  } catch (err) {
    logger.error({ err, fromBlock, toBlock }, 'getLogs failed');
    return;
  }

  for (const log of logs) {
    const transfer = parseBnbTransferLog(log, usdtAddress, usdcAddress);
    if (!transfer) continue;

    const userId = watchedAddresses.get(transfer.to.toLowerCase());
    if (!userId) continue;

    await persistAndEnqueue(db, queue, transfer, userId, 'bnb');
  }
}

/** Insert deposit row (idempotent on tx_hash) and enqueue confirm job */
async function persistAndEnqueue(
  db: Db,
  queue: Queue,
  transfer: ParsedTransfer,
  userId: string,
  chain: 'bnb' | 'sol',
): Promise<void> {
  const { deposits } = await import('@wp/admin-api/db-schema');
  const { eq } = await import('drizzle-orm');

  // Idempotency guard — skip if already recorded
  const existing = await db
    .select({ id: deposits.id })
    .from(deposits)
    .where(eq(deposits.txHash, transfer.txHash))
    .limit(1);

  if (existing.length > 0) {
    logger.debug({ txHash: transfer.txHash }, 'Deposit already recorded — skipping');
    return;
  }

  const [inserted] = await db
    .insert(deposits)
    .values({
      userId,
      chain,
      token: transfer.token,
      amount: (Number(transfer.amount) / 1e18).toFixed(18),
      txHash: transfer.txHash,
      status: 'pending',
    })
    .returning({ id: deposits.id });

  if (!inserted) {
    logger.error({ txHash: transfer.txHash }, 'Failed to insert deposit row');
    return;
  }

  await enqueueDepositConfirm(queue, {
    depositId: inserted.id,
    chain,
    txHash: transfer.txHash,
    detectedAtBlock: transfer.blockNumber,
  });

  logger.info(
    { depositId: inserted.id, txHash: transfer.txHash, chain },
    'Deposit recorded and job enqueued',
  );
}
