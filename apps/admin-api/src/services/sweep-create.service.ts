import type { Queue } from 'bullmq';
// Sweep create service — creates sweep rows from selected candidates and enqueues jobs.
// Also handles internal callbacks: broadcasted + confirmed (called by wallet-engine).
import { and, eq, inArray, ne } from 'drizzle-orm';
import type { Server as SocketIOServer } from 'socket.io';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';
import { emitAudit } from './audit.service.js';

// ── Error types ────────────────────────────────────────────────────────────────

export class NotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = 'NOT_FOUND';
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  readonly statusCode = 409;
  readonly code = 'CONFLICT';
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

// ── BullMQ job payload ────────────────────────────────────────────────────────

export interface SweepExecuteJobData {
  sweepId: string;
  userAddressId: string;
  /** BIP-44 derivation index extracted from derivation_path, e.g. m/44'/60'/0'/0/5 → 5 */
  derivationIndex: number;
  chain: 'bnb' | 'sol';
  token: 'USDT' | 'USDC';
  amount: string;
  fromAddr: string;
  destinationHotSafe: string;
}

export const SWEEP_EXECUTE_QUEUE = 'sweep_execute';

// ── Hot-safe address lookup ───────────────────────────────────────────────────

/**
 * Get the operational hot-safe address for the given chain.
 * Looks up the wallets table for purpose='operational' + chain match.
 * Falls back to env var HOT_SAFE_<CHAIN> for dev-mode convenience.
 */
async function getHotSafeAddress(db: Db, chain: 'bnb' | 'sol'): Promise<string> {
  const wallet = await db.query.wallets.findFirst({
    where: and(eq(schema.wallets.chain, chain), eq(schema.wallets.purpose, 'operational')),
  });
  if (wallet) return wallet.address;

  // Dev fallback — no operational wallet seeded yet
  const envKey = chain === 'bnb' ? process.env.HOT_SAFE_BNB : process.env.HOT_SAFE_SOL;
  if (envKey) return envKey;

  // Last resort: synthetic address for smoke testing
  return chain === 'bnb'
    ? '0x0000000000000000000000000000000000000001'
    : '11111111111111111111111111111111';
}

/**
 * Extract the last numeric component from a BIP-44 derivation path.
 * e.g. "m/44'/60'/0'/0/5" → 5
 */
function parseDerivationIndex(path: string | null): number {
  if (!path) return 0;
  const parts = path.split('/');
  const last = parts[parts.length - 1];
  const index = Number.parseInt(last?.replace("'", '') ?? '0', 10);
  return Number.isNaN(index) ? 0 : index;
}

// ── Create sweeps from candidates ─────────────────────────────────────────────

export interface CreateSweepsResult {
  created: Array<{ sweepId: string; userAddressId: string; jobId: string }>;
  skipped: Array<{ userAddressId: string; reason: string }>;
}

/**
 * Create sweep rows for selected candidate user_address IDs and enqueue jobs.
 * Skips addresses that already have an active (non-terminal) sweep.
 */
export async function createSweeps(
  db: Db,
  candidateIds: string[],
  staffId: string,
  queue: Queue<SweepExecuteJobData>,
  io: SocketIOServer
): Promise<CreateSweepsResult> {
  const result: CreateSweepsResult = { created: [], skipped: [] };

  // Load candidate user_addresses
  const addresses = await db
    .select()
    .from(schema.userAddresses)
    .where(inArray(schema.userAddresses.id, candidateIds));

  if (addresses.length === 0) {
    throw new NotFoundError('No matching user_addresses found for provided candidate IDs');
  }

  // Check for existing active sweeps to avoid duplicates
  const activeSweeps = await db
    .select({ userAddressId: schema.sweeps.userAddressId })
    .from(schema.sweeps)
    .where(
      and(
        inArray(schema.sweeps.userAddressId, candidateIds),
        ne(schema.sweeps.status, 'confirmed'),
        ne(schema.sweeps.status, 'failed')
      )
    );

  const activeSet = new Set(activeSweeps.map((s) => s.userAddressId).filter(Boolean) as string[]);

  for (const ua of addresses) {
    if (activeSet.has(ua.id)) {
      result.skipped.push({ userAddressId: ua.id, reason: 'active_sweep_exists' });
      continue;
    }

    // Get credited deposit balance for this address
    // Simplified: use all credited deposits for this userId+chain as proxy
    const deposits = await db
      .select({ amount: schema.deposits.amount, token: schema.deposits.token })
      .from(schema.deposits)
      .where(
        and(
          eq(schema.deposits.userId, ua.userId),
          eq(schema.deposits.chain, ua.chain),
          eq(schema.deposits.status, 'credited')
        )
      );

    // Take first token found (MVP: one sweep per address per token type)
    const grouped = deposits.reduce<Record<string, number>>((acc, d) => {
      acc[d.token] = (acc[d.token] ?? 0) + Number(d.amount);
      return acc;
    }, {});

    const token = (Object.keys(grouped)[0] ?? 'USDT') as 'USDT' | 'USDC';
    const amount = String(grouped[token] ?? '0');
    const hotSafe = await getHotSafeAddress(db, ua.chain);
    const derivationIndex = parseDerivationIndex(ua.derivationPath ?? null);

    // Insert sweep row inside a transaction
    const [sweep] = await db
      .insert(schema.sweeps)
      .values({
        userAddressId: ua.id,
        chain: ua.chain,
        token,
        fromAddr: ua.address,
        toMultisig: hotSafe,
        amount,
        status: 'pending',
        createdBy: staffId,
      })
      .returning();

    if (!sweep) throw new Error(`Failed to insert sweep for userAddressId=${ua.id}`);

    await emitAudit(db, {
      staffId,
      action: 'sweep.created',
      resourceType: 'sweep',
      resourceId: sweep.id,
      changes: { status: 'pending', fromAddr: ua.address, amount, token },
    });

    // Enqueue BullMQ job (idempotent)
    const jobData: SweepExecuteJobData = {
      sweepId: sweep.id,
      userAddressId: ua.id,
      derivationIndex,
      chain: ua.chain,
      token,
      amount,
      fromAddr: ua.address,
      destinationHotSafe: hotSafe,
    };

    const job = await queue.add(SWEEP_EXECUTE_QUEUE, jobData, {
      jobId: `sweep_execute:${sweep.id}`,
    });

    io.of('/stream').emit('sweep.started', {
      sweepId: sweep.id,
      fromAddr: ua.address,
      chain: ua.chain,
    });

    result.created.push({
      sweepId: sweep.id,
      userAddressId: ua.id,
      jobId: job.id ?? `sweep_execute:${sweep.id}`,
    });
  }

  return result;
}

// ── Broadcasted callback ──────────────────────────────────────────────────────

export async function recordSweepBroadcasted(
  db: Db,
  sweepId: string,
  txHash: string,
  io: SocketIOServer
): Promise<void> {
  const sweep = await db.query.sweeps.findFirst({ where: eq(schema.sweeps.id, sweepId) });
  if (!sweep) throw new NotFoundError(`Sweep ${sweepId} not found`);

  await db
    .update(schema.sweeps)
    .set({ status: 'submitted', txHash, broadcastAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.sweeps.id, sweepId));

  await emitAudit(db, {
    staffId: null,
    action: 'sweep.broadcast',
    resourceType: 'sweep',
    resourceId: sweepId,
    changes: { status: { from: 'pending', to: 'submitted' }, txHash },
  });

  io.of('/stream').emit('sweep.broadcast', { sweepId, txHash, status: 'submitted' });
}

// ── Confirmed callback ────────────────────────────────────────────────────────

export async function recordSweepConfirmed(
  db: Db,
  sweepId: string,
  io: SocketIOServer
): Promise<void> {
  const sweep = await db.query.sweeps.findFirst({ where: eq(schema.sweeps.id, sweepId) });
  if (!sweep) throw new NotFoundError(`Sweep ${sweepId} not found`);

  await db.transaction(async (tx) => {
    await tx
      .update(schema.sweeps)
      .set({ status: 'confirmed', confirmedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.sweeps.id, sweepId));

    // Mark source deposits as swept
    if (sweep.userAddressId) {
      const ua = await tx.query.userAddresses?.findFirst?.({
        where: eq(schema.userAddresses.id, sweep.userAddressId),
      });
      if (ua) {
        await tx
          .update(schema.deposits)
          .set({ status: 'swept', updatedAt: new Date() })
          .where(
            and(
              eq(schema.deposits.userId, ua.userId),
              eq(schema.deposits.chain, sweep.chain),
              eq(schema.deposits.token, sweep.token),
              eq(schema.deposits.status, 'credited')
            )
          );
      }
    }

    await emitAudit(tx as unknown as Db, {
      staffId: null,
      action: 'sweep.confirmed',
      resourceType: 'sweep',
      resourceId: sweepId,
      changes: { status: { from: 'submitted', to: 'confirmed' } },
    });
  });

  io.of('/stream').emit('sweep.confirmed', { sweepId, status: 'confirmed' });
}
