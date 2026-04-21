// Withdrawal CSV export service — mirrors audit-csv.service.ts pattern
// Columns: id, created_at, chain, tier, destination, token, amount_minor, status,
//          tx_hash, initiated_by_email, approved_count, broadcast_at, confirmed_at
import { and, asc, count, eq, gte, inArray, lte } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';

export interface WithdrawalExportParams {
  chain?: string | undefined;
  tier?: string | undefined;
  status?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

const CSV_HEADERS = [
  'id',
  'created_at',
  'chain',
  'tier',
  'destination',
  'token',
  'amount_minor',
  'status',
  'tx_hash',
  'initiated_by_email',
  'approved_count',
  'broadcast_at',
  'confirmed_at',
] as const;

/** Escape a CSV field value per RFC 4180. */
function escapeCsvField(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatCsvRow(fields: (string | number | null | undefined)[]): string {
  return fields.map(escapeCsvField).join(',');
}

export function withdrawalCsvHeader(): string {
  return CSV_HEADERS.join(',');
}

/** Build WHERE conditions for withdrawal export filters. */
function buildConditions(params: WithdrawalExportParams) {
  const conditions = [];
  if (params.chain) conditions.push(eq(schema.withdrawals.chain, params.chain as 'bnb' | 'sol'));
  if (params.tier)
    conditions.push(eq(schema.withdrawals.sourceTier, params.tier as 'hot' | 'cold'));
  if (params.status)
    conditions.push(
      eq(
        schema.withdrawals.status,
        params.status as
          | 'pending'
          | 'approved'
          | 'time_locked'
          | 'executing'
          | 'broadcast'
          | 'cancelling'
          | 'completed'
          | 'cancelled'
          | 'failed'
      )
    );
  if (params.from) conditions.push(gte(schema.withdrawals.createdAt, new Date(params.from)));
  if (params.to) conditions.push(lte(schema.withdrawals.createdAt, new Date(params.to)));
  return conditions;
}

/** Count withdrawals matching filter — used for 50k cap check. */
export async function countWithdrawalsForExport(
  db: Db,
  params: WithdrawalExportParams
): Promise<number> {
  const conditions = buildConditions(params);
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await db.select({ value: count() }).from(schema.withdrawals).where(where);
  return Number(rows[0]?.value ?? 0);
}

export interface WithdrawalExportRow {
  id: string;
  createdAt: string;
  chain: string;
  tier: string;
  destination: string;
  token: string;
  amountMinor: string;
  status: string;
  txHash: string | null;
  initiatedByEmail: string | null;
  approvedCount: number;
  broadcastAt: string | null;
  confirmedAt: string | null;
}

/** Query withdrawals for export — joins staffMembers for initiator email.
 *  Resolves approvedCount from multisig_operations.collected_sigs via batch query.
 */
export async function queryWithdrawalsForExport(
  db: Db,
  params: WithdrawalExportParams
): Promise<WithdrawalExportRow[]> {
  const conditions = buildConditions(params);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: schema.withdrawals.id,
      createdAt: schema.withdrawals.createdAt,
      chain: schema.withdrawals.chain,
      sourceTier: schema.withdrawals.sourceTier,
      destinationAddr: schema.withdrawals.destinationAddr,
      token: schema.withdrawals.token,
      amount: schema.withdrawals.amount,
      status: schema.withdrawals.status,
      txHash: schema.withdrawals.txHash,
      initiatedByEmail: schema.staffMembers.email,
      broadcastAt: schema.withdrawals.broadcastAt,
      multisigOpId: schema.withdrawals.multisigOpId,
    })
    .from(schema.withdrawals)
    .leftJoin(schema.staffMembers, eq(schema.withdrawals.createdBy, schema.staffMembers.id))
    .where(where)
    .orderBy(asc(schema.withdrawals.createdAt));

  // Batch-resolve approved_count from multisig_operations to avoid N+1.
  const opIds = [...new Set(rows.map((r) => r.multisigOpId).filter((id): id is string => !!id))];
  const sigCountMap = new Map<string, number>();

  if (opIds.length > 0) {
    const ops = await db
      .select({
        id: schema.multisigOperations.id,
        collectedSigs: schema.multisigOperations.collectedSigs,
      })
      .from(schema.multisigOperations)
      .where(inArray(schema.multisigOperations.id, opIds));

    for (const op of ops) {
      sigCountMap.set(op.id, op.collectedSigs);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    chain: r.chain,
    tier: r.sourceTier,
    destination: r.destinationAddr,
    token: r.token,
    amountMinor: r.amount,
    status: r.status,
    txHash: r.txHash ?? null,
    initiatedByEmail: r.initiatedByEmail ?? null,
    approvedCount: r.multisigOpId ? (sigCountMap.get(r.multisigOpId) ?? 0) : 0,
    broadcastAt: r.broadcastAt?.toISOString() ?? null,
    confirmedAt: null, // confirmed_at not stored in withdrawals table
  }));
}

/** Stream withdrawal rows as CSV to the provided write callback. */
export function streamWithdrawalCsv(
  rows: WithdrawalExportRow[],
  write: (chunk: string) => void
): void {
  write(`${withdrawalCsvHeader()}\n`);
  for (const row of rows) {
    const line = formatCsvRow([
      row.id,
      row.createdAt,
      row.chain,
      row.tier,
      row.destination,
      row.token,
      row.amountMinor,
      row.status,
      row.txHash,
      row.initiatedByEmail,
      row.approvedCount,
      row.broadcastAt,
      row.confirmedAt,
    ]);
    write(`${line}\n`);
  }
}
