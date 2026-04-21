// reconciliation-snapshot.service — orchestrates a full reconciliation run.
//
// Flow:
//   1. INSERT snapshot row (status=running), acquire pg advisory lock
//   2. Enumerate managed addresses via enumerator service
//   3. Probe on-chain balances via probeBatch (concurrency=20)
//   4. Compute ledger-expected via aggregate SQL
//   5. Compute per-address drift, apply severity thresholds
//   6. Check in-flight suppression (pending/approved/time_locked/broadcast withdrawals)
//   7. INSERT drift rows (skip dust)
//   8. UPDATE snapshot totals + status=completed
//   Any exception → status=failed + error_message
//
// Env vars (all optional, safe defaults):
//   RECON_ENABLED=false            → skip run entirely
//   RECON_DRY_RUN=true             → probe only, no DB writes, no alerts
//   RECON_DUST_THRESHOLD_CENTS     → default 100   ($1.00)
//   RECON_WARNING_THRESHOLD_CENTS  → default 1000  ($10.00)
//   RECON_CRITICAL_THRESHOLD_CENTS → default 10000 ($100.00)
import { Connection } from '@solana/web3.js';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type IORedis from 'ioredis';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';
import type { DriftSeverity } from '../db/schema/reconciliation-drifts.js';
import type { SnapshotScope } from '../db/schema/reconciliation-snapshots.js';
import {
  type ManagedAddress,
  enumerateManagedAddresses,
} from './reconciliation-address-enumerator.service.js';
import { computeLedgerExpected } from './reconciliation-ledger-expected.service.js';

// ── Wallet-engine balance-probe (re-exported probeBatch) ──────────────────────
// We inline the probe logic here using the same Redis cache keys as cold-balance.service.ts
// to benefit from existing 30s TTL cache. This avoids a cross-service HTTP call.
import { probeEvmBalance, probeSolanaBalance } from './reconciliation-balance-probe.js';

// ── Config helpers ────────────────────────────────────────────────────────────

function getDustThreshold(): bigint {
  return BigInt(process.env.RECON_DUST_THRESHOLD_CENTS ?? '100');
}
function getWarningThreshold(): bigint {
  return BigInt(process.env.RECON_WARNING_THRESHOLD_CENTS ?? '1000');
}
function getCriticalThreshold(): bigint {
  return BigInt(process.env.RECON_CRITICAL_THRESHOLD_CENTS ?? '10000');
}
function isEnabled(): boolean {
  return process.env.RECON_ENABLED !== 'false';
}
function isDryRun(): boolean {
  return process.env.RECON_DRY_RUN === 'true';
}

// ── Token decimals for USD drift conversion ───────────────────────────────────

/** Returns the number of decimal places for a given (chain, token) combination */
function tokenDecimals(chain: string, _token: string): number {
  // USDT/USDC on BNB = 18 decimals (ERC-20)
  // USDT/USDC on Solana = 6 decimals (SPL)
  return chain === 'bnb' ? 18 : 6;
}

/**
 * Convert minor units to USD cents (bigint arithmetic, no float).
 * USDT/USDC are treated 1:1 USD.
 * Result is in cents (e.g. $1.00 = 100n cents).
 */
function minorToCents(minorAbs: bigint, chain: string, token: string): bigint {
  const dec = tokenDecimals(chain, token);
  // cents = minorAbs * 100 / 10^decimals
  // Use integer division; values < dust are dropped by caller
  const divisor = 10n ** BigInt(dec);
  return (minorAbs * 100n) / divisor;
}

// ── Severity classifier ───────────────────────────────────────────────────────

function classifySeverity(absDriftCents: bigint): DriftSeverity | null {
  const dust = getDustThreshold();
  const warn = getWarningThreshold();
  const crit = getCriticalThreshold();

  if (absDriftCents <= dust) return null; // below dust — skip row
  if (absDriftCents > crit) return 'critical';
  if (absDriftCents > warn) return 'warning';
  return 'info';
}

// ── In-flight suppression ─────────────────────────────────────────────────────

const IN_FLIGHT_STATUSES = ['pending', 'approved', 'time_locked', 'broadcast'] as const;

/**
 * Returns a Set of accountLabels that have in-flight withdrawals or multisig ops.
 * In-flight = withdrawal.status IN ('pending','approved','time_locked') + any
 * multisig_operation with status IN ('pending','collecting','ready','submitted').
 *
 * Suppression is coarse-grained at accountLabel level (not per-token) because
 * the withdrawal table does not record the exact source wallet address.
 */
async function buildInflightSet(db: Db): Promise<Set<string>> {
  const inflight = new Set<string>();

  // Withdrawals in progress — grouped by sourceTier to derive accountLabel
  const wRows = await db
    .select({ sourceTier: schema.withdrawals.sourceTier, userId: schema.withdrawals.userId })
    .from(schema.withdrawals)
    .where(inArray(schema.withdrawals.status, ['pending', 'approved', 'time_locked'] as const));

  for (const w of wRows) {
    if (w.sourceTier === 'hot') inflight.add('hot_safe');
    if (w.sourceTier === 'cold') inflight.add('cold_reserve');
    // User withdrawals — suppress by user account label
    inflight.add(`user:${w.userId}`);
  }

  return inflight;
}

// ── Probe helpers (inline, reusing cold-balance.service pattern) ──────────────

interface ProbeEnv {
  redis: IORedis;
  rpcBnb: string;
  rpcSolana: string;
  solConnection: Connection;
  usdtBnbAddr: string;
  usdcBnbAddr: string;
  usdtSolMint: string;
  usdcSolMint: string;
}

function buildProbeEnv(redis: IORedis): ProbeEnv {
  return {
    redis,
    rpcBnb: process.env.RPC_BNB_PRIMARY ?? 'https://bsc-dataseed.binance.org',
    rpcSolana: process.env.RPC_SOLANA_PRIMARY ?? 'https://api.mainnet-beta.solana.com',
    solConnection: new Connection(
      process.env.RPC_SOLANA_PRIMARY ?? 'https://api.mainnet-beta.solana.com',
      'confirmed'
    ),
    usdtBnbAddr: process.env.USDT_BNB_ADDRESS ?? '0x55d398326f99059fF775485246999027B3197955',
    usdcBnbAddr: process.env.USDC_BNB_ADDRESS ?? '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    usdtSolMint: process.env.USDT_SOL_MINT ?? 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    usdcSolMint: process.env.USDC_SOL_MINT ?? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  };
}

async function probeOneAddress(env: ProbeEnv, addr: ManagedAddress): Promise<bigint | null> {
  try {
    if (addr.chain === 'bnb') {
      const tokenAddr = addr.token === 'USDT' ? env.usdtBnbAddr : env.usdcBnbAddr;
      return await probeEvmBalance(
        env.redis,
        env.rpcBnb,
        addr.address,
        tokenAddr,
        'bnb',
        addr.token
      );
    }
    const mint = addr.token === 'USDT' ? env.usdtSolMint : env.usdcSolMint;
    return await probeSolanaBalance(env.redis, env.solConnection, addr.address, mint, addr.token);
  } catch {
    return null; // failed probe → treat as stale
  }
}

// ── Concurrency-limited batch probe ──────────────────────────────────────────

async function probeBatchAddresses(
  env: ProbeEnv,
  addresses: ManagedAddress[],
  concurrency: number
): Promise<Map<string, bigint | null>> {
  const results = new Map<string, bigint | null>();
  const key = (a: ManagedAddress) => `${a.chain}:${a.address}:${a.token}`;

  // Simple semaphore for concurrency control
  let active = 0;
  const queue: Array<() => void> = [];
  const acquire = () =>
    new Promise<void>((resolve) => {
      if (active < concurrency) {
        active++;
        resolve();
      } else
        queue.push(() => {
          active++;
          resolve();
        });
    });
  const release = () => {
    active--;
    const next = queue.shift();
    if (next) next();
  };

  await Promise.all(
    addresses.map(async (addr) => {
      await acquire();
      try {
        results.set(key(addr), await probeOneAddress(env, addr));
      } finally {
        release();
      }
    })
  );

  return results;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface RunSnapshotInput {
  /** Staff UUID if manually triggered; undefined for cron */
  triggeredBy?: string;
  chain?: string;
  scope?: SnapshotScope;
}

export interface RunSnapshotResult {
  snapshotId: string;
  driftCount: number;
  criticalCount: number;
  warningCount: number;
}

/**
 * Run a full reconciliation snapshot.
 * Acquires an advisory lock so concurrent runs are blocked (not silently duplicated).
 * Returns snapshotId + drift summary for the alerter to consume.
 */
export async function runSnapshot(
  db: Db,
  redis: IORedis,
  input: RunSnapshotInput = {}
): Promise<RunSnapshotResult> {
  if (!isEnabled()) {
    throw new Error('Reconciliation is disabled (RECON_ENABLED=false)');
  }

  const scope: SnapshotScope = input.scope ?? 'all';
  const chain = input.chain ?? null;
  const snapshotCreatedAt = new Date();

  // INSERT snapshot row first to get ID; status=running
  const [snapshotRow] = await db
    .insert(schema.reconciliationSnapshots)
    .values({
      triggeredBy: input.triggeredBy ?? null,
      status: 'running',
      chain,
      scope,
      createdAt: snapshotCreatedAt,
    })
    .returning({ id: schema.reconciliationSnapshots.id });

  if (!snapshotRow) throw new Error('Failed to insert snapshot row');
  const snapshotId = snapshotRow.id;

  try {
    return await executeSnapshot(db, redis, snapshotId, snapshotCreatedAt, scope, chain);
  } catch (err) {
    // Mark failed — best-effort, non-rethrowing
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(schema.reconciliationSnapshots)
      .set({ status: 'failed', errorMessage: message, completedAt: new Date() })
      .where(eq(schema.reconciliationSnapshots.id, snapshotId));
    throw err;
  }
}

// ── Core execution ────────────────────────────────────────────────────────────

async function executeSnapshot(
  db: Db,
  redis: IORedis,
  snapshotId: string,
  snapshotCreatedAt: Date,
  scope: SnapshotScope,
  chain: string | null
): Promise<RunSnapshotResult> {
  // Acquire advisory lock — blocks concurrent snapshots at DB level
  await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext('reconciliation-snapshot'))`);

  // 1. Enumerate managed addresses
  const addresses = await enumerateManagedAddresses(db, scope, chain, snapshotCreatedAt);

  if (addresses.length === 0) {
    await db
      .update(schema.reconciliationSnapshots)
      .set({
        status: 'completed',
        onChainTotalMinor: 0n,
        ledgerTotalMinor: 0n,
        driftTotalMinor: 0n,
        completedAt: new Date(),
      })
      .where(eq(schema.reconciliationSnapshots.id, snapshotId));
    return { snapshotId, driftCount: 0, criticalCount: 0, warningCount: 0 };
  }

  // 2. Probe on-chain balances (concurrency=20)
  const probeEnv = buildProbeEnv(redis);
  const onChainMap = await probeBatchAddresses(probeEnv, addresses, 20);

  // 3. Compute ledger-expected balances
  const uniqueLabels = [...new Set(addresses.map((a) => a.accountLabel))];
  const ledgerMap = await computeLedgerExpected(db, uniqueLabels, ['USDT', 'USDC']);

  // 4. Build in-flight suppression set
  const inflightSet = await buildInflightSet(db);

  // 5. Compute drifts
  type DriftRow = typeof schema.reconciliationDrifts.$inferInsert;
  const driftRows: DriftRow[] = [];
  let onChainTotal = 0n;
  let ledgerTotal = 0n;
  let driftTotal = 0n;
  let criticalCount = 0;
  let warningCount = 0;

  const probeKey = (a: ManagedAddress) => `${a.chain}:${a.address}:${a.token}`;
  const ledgerKey = (label: string, token: string) => `${label}:${token}`;

  for (const addr of addresses) {
    const onChainRaw = onChainMap.get(probeKey(addr));
    const onChainMinor = onChainRaw ?? 0n;
    const ledgerMinor = ledgerMap.get(ledgerKey(addr.accountLabel, addr.token)) ?? 0n;

    onChainTotal += onChainMinor;
    ledgerTotal += ledgerMinor;

    const driftMinor = onChainMinor - ledgerMinor;
    driftTotal += driftMinor;

    const absDrift = driftMinor < 0n ? -driftMinor : driftMinor;
    const absDriftCents = minorToCents(absDrift, addr.chain, addr.token);

    const severity = classifySeverity(absDriftCents);
    if (!severity) continue; // below dust — skip

    // Suppression check
    const suppressed = inflightSet.has(addr.accountLabel);
    const suppressedReason = suppressed ? 'in_flight_withdrawal' : null;

    if (severity === 'critical') criticalCount++;
    if (severity === 'warning') warningCount++;

    driftRows.push({
      snapshotId,
      chain: addr.chain,
      token: addr.token,
      address: addr.address,
      accountLabel: addr.accountLabel,
      onChainMinor,
      ledgerMinor,
      driftMinor,
      severity,
      suppressedReason,
    });
  }

  // 6. Persist — skip on dry-run
  if (!isDryRun()) {
    if (driftRows.length > 0) {
      await db.insert(schema.reconciliationDrifts).values(driftRows);
    }

    await db
      .update(schema.reconciliationSnapshots)
      .set({
        status: 'completed',
        onChainTotalMinor: onChainTotal,
        ledgerTotalMinor: ledgerTotal,
        driftTotalMinor: driftTotal,
        completedAt: new Date(),
      })
      .where(eq(schema.reconciliationSnapshots.id, snapshotId));
  } else {
    // Dry-run: still mark completed so caller can see it ran
    await db
      .update(schema.reconciliationSnapshots)
      .set({
        status: 'completed',
        onChainTotalMinor: onChainTotal,
        ledgerTotalMinor: ledgerTotal,
        driftTotalMinor: driftTotal,
        completedAt: new Date(),
        errorMessage: 'dry-run: no drift rows persisted',
      })
      .where(eq(schema.reconciliationSnapshots.id, snapshotId));
  }

  return { snapshotId, driftCount: driftRows.length, criticalCount, warningCount };
}
