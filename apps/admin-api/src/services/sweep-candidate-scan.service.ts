// Sweep candidate scan service — identifies user HD addresses with credited
// deposits above the sweep threshold that have not yet been swept.
//
// A "candidate" is a user_addresses row where:
//   sum(credited deposits) - sum(confirmed sweeps) > SWEEP_MIN_AMOUNT_USD
//
// Balances are synthesised in dev-mode (no real RPC call needed for Phase 01).
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';

/** Minimum USD value to include an address in a sweep candidate list */
export const SWEEP_MIN_AMOUNT_USD = Number(process.env.SWEEP_MIN_AMOUNT_USD ?? 100);

export interface SweepCandidate {
  userAddressId: string;
  userId: string;
  chain: 'bnb' | 'sol';
  address: string;
  derivationPath: string | null;
  /** Decimal string — total credited-not-yet-swept per token */
  creditedUsdt: string;
  creditedUsdc: string;
  /** Estimated sweep amount = creditedUsdt + creditedUsdc in USD (1:1 stablecoin assumption) */
  estimatedUsd: number;
}

/**
 * Scan for sweep candidates.
 * Returns user_addresses that have credited deposits above the threshold.
 *
 * Algorithm:
 *  1. Aggregate ledger credits on `user:<userId>` account with currency
 *  2. Sum existing sweeps (non-failed) to compute already-swept amount
 *  3. Candidate = credit_total - swept_total > threshold
 *
 * Dev-mode shortcut: queries deposits table for credited rows since
 * the ledger may not be fully seeded in test environments.
 */
export async function scanSweepCandidates(
  db: Db,
  chain?: 'bnb' | 'sol',
  token?: 'USDT' | 'USDC',
  minAmountUsd = SWEEP_MIN_AMOUNT_USD
): Promise<SweepCandidate[]> {
  // Step 1: Find user_addresses with credited deposits
  const chainFilter = chain ? eq(schema.deposits.chain, chain) : undefined;
  const tokenFilter = token ? eq(schema.deposits.token, token) : undefined;

  const filters = [
    eq(schema.deposits.status, 'credited'),
    ...(chainFilter ? [chainFilter] : []),
    ...(tokenFilter ? [tokenFilter] : []),
  ];

  // Aggregate credited deposit amounts per (userId, chain, token)
  const creditedRows = await db
    .select({
      userId: schema.deposits.userId,
      chain: schema.deposits.chain,
      token: schema.deposits.token,
      totalAmount: sql<string>`SUM(${schema.deposits.amount}::numeric)`.as('total_amount'),
    })
    .from(schema.deposits)
    .where(and(...filters))
    .groupBy(schema.deposits.userId, schema.deposits.chain, schema.deposits.token);

  if (creditedRows.length === 0) return [];

  // Step 2: Get existing active sweeps (scheduled/signing/broadcast) to avoid double-sweep
  const userIds = [...new Set(creditedRows.map((r) => r.userId))];
  const activeSweeps = await db
    .select({
      fromAddr: schema.sweeps.fromAddr,
      chain: schema.sweeps.chain,
      token: schema.sweeps.token,
      amount: schema.sweeps.amount,
    })
    .from(schema.sweeps)
    .where(and(ne(schema.sweeps.status, 'failed'), ne(schema.sweeps.status, 'confirmed')));

  // Build lookup: fromAddr+chain+token → swept amount
  const sweptMap = new Map<string, number>();
  for (const s of activeSweeps) {
    const key = `${s.fromAddr}:${s.chain}:${s.token}`;
    sweptMap.set(key, (sweptMap.get(key) ?? 0) + Number(s.amount));
  }

  // Step 3: Load user_addresses for these users
  const userAddressRows = await db
    .select()
    .from(schema.userAddresses)
    .where(
      and(
        inArray(schema.userAddresses.userId, userIds),
        ...(chain ? [eq(schema.userAddresses.chain, chain)] : [])
      )
    );

  // Index addresses by userId+chain
  const addressByUserChain = new Map<string, (typeof userAddressRows)[0]>();
  for (const ua of userAddressRows) {
    addressByUserChain.set(`${ua.userId}:${ua.chain}`, ua);
  }

  // Step 4: Build candidate list
  const candidateMap = new Map<string, SweepCandidate>();

  for (const row of creditedRows) {
    const ua = addressByUserChain.get(`${row.userId}:${row.chain}`);
    if (!ua) continue; // no HD address on this chain

    const key = ua.id;
    let cand = candidateMap.get(key);
    if (!cand) {
      cand = {
        userAddressId: ua.id,
        userId: ua.userId,
        chain: row.chain,
        address: ua.address,
        derivationPath: ua.derivationPath ?? null,
        creditedUsdt: '0',
        creditedUsdc: '0',
        estimatedUsd: 0,
      };
      candidateMap.set(key, cand);
    }

    const sweptKey = `${ua.address}:${row.chain}:${row.token}`;
    const alreadySwept = sweptMap.get(sweptKey) ?? 0;
    const net = Math.max(0, Number(row.totalAmount) - alreadySwept);

    if (row.token === 'USDT') {
      cand.creditedUsdt = String(net);
    } else {
      cand.creditedUsdc = String(net);
    }
    cand.estimatedUsd = Number(cand.creditedUsdt) + Number(cand.creditedUsdc);
  }

  // Filter by minimum threshold
  return Array.from(candidateMap.values()).filter((c) => c.estimatedUsd >= minAmountUsd);
}
