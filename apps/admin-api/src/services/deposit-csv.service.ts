import { and, asc, count, eq, gte, lte } from 'drizzle-orm';
// Deposit CSV export service — mirrors audit-csv.service.ts pattern
// Columns: id, created_at, chain, user_email, token, amount_minor, tx_hash, status, block_number, confirmations
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';

export interface DepositExportParams {
  chain?: string | undefined;
  userId?: string | undefined;
  status?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

const CSV_HEADERS = [
  'id',
  'created_at',
  'chain',
  'user_email',
  'token',
  'amount_minor',
  'tx_hash',
  'status',
  'block_number',
  'confirmations',
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

export function depositCsvHeader(): string {
  return CSV_HEADERS.join(',');
}

/** Build the WHERE conditions for deposit export filters. */
function buildConditions(params: DepositExportParams) {
  const conditions = [];
  if (params.chain) conditions.push(eq(schema.deposits.chain, params.chain as 'bnb' | 'sol'));
  if (params.userId) conditions.push(eq(schema.deposits.userId, params.userId));
  if (params.status)
    conditions.push(
      eq(
        schema.deposits.status,
        params.status as 'pending' | 'credited' | 'swept' | 'failed' | 'reorg_pending'
      )
    );
  if (params.from) conditions.push(gte(schema.deposits.createdAt, new Date(params.from)));
  if (params.to) conditions.push(lte(schema.deposits.createdAt, new Date(params.to)));
  return conditions;
}

/** Count deposits matching filter — used for 50k cap check. */
export async function countDepositsForExport(db: Db, params: DepositExportParams): Promise<number> {
  const conditions = buildConditions(params);
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await db.select({ value: count() }).from(schema.deposits).where(where);
  return Number(rows[0]?.value ?? 0);
}

export interface DepositExportRow {
  id: string;
  createdAt: string;
  chain: string;
  userEmail: string | null;
  token: string;
  amountMinor: string;
  txHash: string | null;
  status: string;
  blockNumber: number;
  confirmations: number;
}

/** Query deposits for export — joins users table for email. */
export async function queryDepositsForExport(
  db: Db,
  params: DepositExportParams
): Promise<DepositExportRow[]> {
  const conditions = buildConditions(params);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: schema.deposits.id,
      createdAt: schema.deposits.createdAt,
      chain: schema.deposits.chain,
      userEmail: schema.users.email,
      token: schema.deposits.token,
      amount: schema.deposits.amount,
      txHash: schema.deposits.txHash,
      status: schema.deposits.status,
      confirmedBlocks: schema.deposits.confirmedBlocks,
    })
    .from(schema.deposits)
    .leftJoin(schema.users, eq(schema.deposits.userId, schema.users.id))
    .where(where)
    .orderBy(asc(schema.deposits.createdAt));

  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    chain: r.chain,
    userEmail: r.userEmail ?? null,
    token: r.token,
    amountMinor: r.amount,
    txHash: r.txHash,
    status: r.status,
    blockNumber: 0, // block_number not stored in deposits table
    confirmations: r.confirmedBlocks,
  }));
}

/** Stream deposit rows as CSV to the provided write callback. */
export function streamDepositCsv(rows: DepositExportRow[], write: (chunk: string) => void): void {
  write(`${depositCsvHeader()}\n`);
  for (const row of rows) {
    const line = formatCsvRow([
      row.id,
      row.createdAt,
      row.chain,
      row.userEmail,
      row.token,
      row.amountMinor,
      row.txHash,
      row.status,
      row.blockNumber,
      row.confirmations,
    ]);
    write(`${line}\n`);
  }
}
