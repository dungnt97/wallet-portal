// Ledger service — double-entry bookkeeping for fund movements
// Each credit operation inserts exactly 2 rows: debit external, credit user balance
// Invariant: debit row has credit=0, credit row has debit=0, amounts are equal
import { eq } from 'drizzle-orm';
import type { PostgresJsTransaction } from 'drizzle-orm/postgres-js';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';

export interface RecordCreditParams {
  /** On-chain tx hash — used as idempotency reference in account label */
  txHash: string;
  userId: string;
  amount: string;
  currency: 'USDT' | 'USDC';
  chain: 'bnb' | 'sol';
}

/**
 * Insert 2 balanced ledger_entries rows inside an existing transaction:
 *   1. Debit  external (incoming funds from chain)
 *   2. Credit user:<userId> (funds land in user's custody balance)
 * Both rows share the same tx_id (a new transactions row inserted here).
 */
export interface RecordWithdrawalBroadcastParams {
  txHash: string;
  withdrawalId: string;
  userId: string;
  amount: string;
  currency: 'USDT' | 'USDC';
  chain: 'bnb' | 'sol';
}

/**
 * Insert 2 balanced ledger_entries rows for a withdrawal broadcast:
 *   1. Debit  user:<userId>  (funds leave user custody balance)
 *   2. Credit hot_safe       (funds credited to the hot wallet pool for on-chain execution)
 * Both rows share the same tx_id (a new transactions row inserted here).
 */
export async function recordWithdrawalBroadcast(
  tx: Db | PostgresJsTransaction<typeof schema, Record<string, never>>,
  params: RecordWithdrawalBroadcastParams
): Promise<void> {
  const { txHash, userId, amount, currency, chain } = params;

  const txRows = await (tx as Db)
    .insert(schema.transactions)
    .values({
      hash: txHash,
      chain,
      fromAddr: `user:${userId}`,
      toAddr: 'hot_safe',
      amount,
      token: currency,
      status: 'pending',
    })
    .returning({ id: schema.transactions.id })
    .onConflictDoUpdate({
      target: schema.transactions.hash,
      set: { status: 'pending' },
    });

  const txRow = txRows[0];
  if (!txRow)
    throw new Error(`Failed to insert/upsert transactions row for withdrawal hash ${txHash}`);
  const txId = txRow.id;

  // Debit: user custody balance loses funds
  await (tx as Db).insert(schema.ledgerEntries).values({
    txId,
    account: `user:${userId}`,
    debit: amount,
    credit: '0',
    currency,
  });

  // Credit: hot_safe operational pool receives the funds
  await (tx as Db).insert(schema.ledgerEntries).values({
    txId,
    account: 'hot_safe',
    debit: '0',
    credit: amount,
    currency,
  });
}

export async function recordCredit(
  // Accept either the full Db or a drizzle transaction context
  tx: Db | PostgresJsTransaction<typeof schema, Record<string, never>>,
  params: RecordCreditParams
): Promise<void> {
  const { txHash, userId, amount, currency, chain } = params;

  // Insert a canonical transactions row (idempotent on hash unique constraint)
  const txRows = await (tx as Db)
    .insert(schema.transactions)
    .values({
      hash: txHash,
      chain,
      fromAddr: 'external',
      toAddr: `user:${userId}`,
      amount,
      token: currency,
      status: 'confirmed',
      confirmedAt: new Date(),
    })
    .returning({ id: schema.transactions.id })
    .onConflictDoUpdate({
      target: schema.transactions.hash,
      set: { status: 'confirmed', confirmedAt: new Date() },
    });

  const txRow = txRows[0];
  if (!txRow) throw new Error(`Failed to insert/upsert transactions row for hash ${txHash}`);
  const txId = txRow.id;

  // Debit: external account loses funds (debit side)
  await (tx as Db).insert(schema.ledgerEntries).values({
    txId,
    account: `external.${chain}`,
    debit: amount,
    credit: '0',
    currency,
  });

  // Credit: user custody balance gains funds (credit side)
  await (tx as Db).insert(schema.ledgerEntries).values({
    txId,
    account: `user:${userId}`,
    debit: '0',
    credit: amount,
    currency,
  });
}
