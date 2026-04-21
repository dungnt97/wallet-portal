// Dashboard history service — time-bucketed series from real DB tables.
// Supports AUM (ledger deltas), deposits (pending count), withdrawals (pending count).
// Bucket granularity: 24h→1h, 7d→4h, 30d→12h, 90d→1d
import { sql } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';

export type HistoryMetric = 'aum' | 'deposits' | 'withdrawals';
export type HistoryRange = '24h' | '7d' | '30d' | '90d';

export interface HistoryPoint {
  t: string; // ISO timestamp of bucket start
  v: number;
}

export interface HistoryResult {
  metric: HistoryMetric;
  range: HistoryRange;
  points: HistoryPoint[];
}

/** Map range → postgres interval string and expected bucket count */
const RANGE_CONFIG: Record<HistoryRange, { intervalHours: number; lookbackHours: number }> = {
  '24h': { intervalHours: 1, lookbackHours: 24 },
  '7d': { intervalHours: 4, lookbackHours: 7 * 24 },
  '30d': { intervalHours: 12, lookbackHours: 30 * 24 },
  '90d': { intervalHours: 24, lookbackHours: 90 * 24 },
};

/**
 * AUM history — cumulative net ledger credits minus debits per time bucket.
 *
 * Strategy: query delta per bucket (SUM credit - debit grouped by date_trunc),
 * then accumulate client-side to produce a cumulative series. Combines both
 * USDT and USDC amounts in USD-equivalent (1:1 stablecoin assumption).
 */
async function fetchAumHistory(db: Db, range: HistoryRange): Promise<HistoryPoint[]> {
  const { intervalHours, lookbackHours } = RANGE_CONFIG[range];
  const intervalStr = `${intervalHours} hours`;
  const lookbackStr = `${lookbackHours} hours`;

  // Use user-account entries only (account LIKE 'user:%') to reflect custody AUM
  const rows = await db.execute(
    sql`
      SELECT
        date_trunc('hour', ${schema.ledgerEntries.createdAt}) +
          INTERVAL ${sql.raw(`'${intervalStr}'`)} *
          floor(extract(epoch from ${schema.ledgerEntries.createdAt} - date_trunc('hour', now() - INTERVAL ${sql.raw(`'${lookbackStr}'`)})) / (${intervalHours} * 3600))
          AS bucket,
        SUM(${schema.ledgerEntries.credit} - ${schema.ledgerEntries.debit}) AS delta
      FROM ${schema.ledgerEntries}
      WHERE
        ${schema.ledgerEntries.createdAt} >= now() - INTERVAL ${sql.raw(`'${lookbackStr}'`)}
        AND ${schema.ledgerEntries.account} LIKE 'user:%'
      GROUP BY bucket
      ORDER BY bucket ASC
    `
  );

  // Build cumulative series: start from the sum before the window
  const [priorRow] = await db.execute(
    sql`
      SELECT COALESCE(SUM(${schema.ledgerEntries.credit} - ${schema.ledgerEntries.debit}), 0) AS prior
      FROM ${schema.ledgerEntries}
      WHERE
        ${schema.ledgerEntries.createdAt} < now() - INTERVAL ${sql.raw(`'${lookbackStr}'`)}
        AND ${schema.ledgerEntries.account} LIKE 'user:%'
    `
  );

  let cumulative = Number((priorRow as Record<string, unknown>)?.prior ?? 0);
  const points: HistoryPoint[] = [];

  for (const row of rows as Array<Record<string, unknown>>) {
    cumulative += Number(row.delta ?? 0);
    points.push({
      t: new Date(row.bucket as string).toISOString(),
      v: Math.max(0, cumulative),
    });
  }

  return points;
}

/**
 * Deposits history — count of deposits created per bucket regardless of status.
 * Shows deposit activity volume, not just pending.
 */
async function fetchDepositsHistory(db: Db, range: HistoryRange): Promise<HistoryPoint[]> {
  const { intervalHours, lookbackHours } = RANGE_CONFIG[range];
  const intervalStr = `${intervalHours} hours`;
  const lookbackStr = `${lookbackHours} hours`;

  const rows = await db.execute(
    sql`
      SELECT
        date_trunc('hour', ${schema.deposits.createdAt}) +
          INTERVAL ${sql.raw(`'${intervalStr}'`)} *
          floor(extract(epoch from ${schema.deposits.createdAt} - date_trunc('hour', now() - INTERVAL ${sql.raw(`'${lookbackStr}'`)})) / (${intervalHours} * 3600))
          AS bucket,
        COUNT(*) AS cnt
      FROM ${schema.deposits}
      WHERE ${schema.deposits.createdAt} >= now() - INTERVAL ${sql.raw(`'${lookbackStr}'`)}
      GROUP BY bucket
      ORDER BY bucket ASC
    `
  );

  return (rows as Array<Record<string, unknown>>).map((row) => ({
    t: new Date(row.bucket as string).toISOString(),
    v: Number(row.cnt ?? 0),
  }));
}

/**
 * Withdrawals history — count of withdrawals created per bucket.
 */
async function fetchWithdrawalsHistory(db: Db, range: HistoryRange): Promise<HistoryPoint[]> {
  const { intervalHours, lookbackHours } = RANGE_CONFIG[range];
  const intervalStr = `${intervalHours} hours`;
  const lookbackStr = `${lookbackHours} hours`;

  const rows = await db.execute(
    sql`
      SELECT
        date_trunc('hour', ${schema.withdrawals.createdAt}) +
          INTERVAL ${sql.raw(`'${intervalStr}'`)} *
          floor(extract(epoch from ${schema.withdrawals.createdAt} - date_trunc('hour', now() - INTERVAL ${sql.raw(`'${lookbackStr}'`)})) / (${intervalHours} * 3600))
          AS bucket,
        COUNT(*) AS cnt
      FROM ${schema.withdrawals}
      WHERE ${schema.withdrawals.createdAt} >= now() - INTERVAL ${sql.raw(`'${lookbackStr}'`)}
      GROUP BY bucket
      ORDER BY bucket ASC
    `
  );

  return (rows as Array<Record<string, unknown>>).map((row) => ({
    t: new Date(row.bucket as string).toISOString(),
    v: Number(row.cnt ?? 0),
  }));
}

/** Dispatch to the correct metric query */
export async function getDashboardHistory(
  db: Db,
  metric: HistoryMetric,
  range: HistoryRange
): Promise<HistoryResult> {
  let points: HistoryPoint[];

  switch (metric) {
    case 'aum':
      points = await fetchAumHistory(db, range);
      break;
    case 'deposits':
      points = await fetchDepositsHistory(db, range);
      break;
    case 'withdrawals':
      points = await fetchWithdrawalsHistory(db, range);
      break;
  }

  return { metric, range, points };
}
