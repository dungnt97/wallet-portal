#!/usr/bin/env tsx
// test-vertical-slice.ts — E2E automation for the deposit flow vertical slice
//
// Prerequisites (must be running before this script):
//   - Postgres on DATABASE_URL
//   - Redis on REDIS_URL
//   - admin-api on ADMIN_API_BASE_URL (default :3001)
//   - wallet-engine with worker started (default :3002)
//
// Steps:
//   1. Resolve a test user ID from DB (first active user) or accept --user-id
//   2. Insert synthetic deposit directly (same logic as simulate-deposit)
//   3. Enqueue BullMQ job with simulated=true
//   4. Poll GET /deposits/:id until status=credited (timeout 30s)
//   5. Assert tx_hash is present
//   6. Assert 2 balanced ledger_entries rows for the tx_hash
//   7. Assert audit_log has a deposit.credit row with non-null hash
//   8. Assert second POST to /internal/deposits/:id/credit returns 409
//   9. Print PASS / FAIL with timing
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import postgres from 'postgres';
import { makeDb } from '../src/db/client.js';
import * as schema from '@wp/admin-api/db-schema';
import { loadConfig } from '../src/config/env.js';

const { values } = parseArgs({
  options: {
    'user-id': { type: 'string' },
    chain: { type: 'string', default: 'bnb' },
    token: { type: 'string', default: 'USDT' },
    amount: { type: 'string', default: '1000' },
    timeout: { type: 'string', default: '30' },
  },
  strict: false,
});

const TIMEOUT_SECS = parseInt(values['timeout'] ?? '30', 10);

async function resolveTestUser(sql: ReturnType<typeof postgres>): Promise<string> {
  const rows = await sql<{ id: string }[]>`
    SELECT id FROM users WHERE status = 'active' LIMIT 1
  `;
  if (rows.length === 0) throw new Error('No active users in DB — run pnpm db:seed first');
  return rows[0].id;
}

async function pollDepositStatus(
  adminApiBase: string,
  svcToken: string,
  depositId: string,
  expectedStatus: string,
  timeoutMs: number,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const res = await fetch(`${adminApiBase}/deposits/${depositId}`, {
      headers: { Authorization: `Bearer ${svcToken}` },
    }).catch(() => null);

    if (res?.ok) {
      const body = (await res.json()) as Record<string, unknown>;
      if (body['status'] === expectedStatus) return body;
      process.stdout.write(`  status=${body['status']}… `);
    }

    await new Promise((r) => setTimeout(r, 1_000));
  }

  throw new Error(`Deposit ${depositId} did not reach status=${expectedStatus} within ${timeoutMs / 1000}s`);
}

async function assertLedgerEntries(
  sql: ReturnType<typeof postgres>,
  txHash: string,
): Promise<void> {
  const rows = await sql<{ debit: string; credit: string }[]>`
    SELECT le.debit, le.credit
    FROM ledger_entries le
    JOIN transactions t ON t.id = le.tx_id
    WHERE t.hash = ${txHash}
  `;

  if (rows.length !== 2) {
    throw new Error(`Expected 2 ledger_entries for tx_hash=${txHash}, got ${rows.length}`);
  }

  const debitRow = rows.find((r) => parseFloat(r.debit) > 0);
  const creditRow = rows.find((r) => parseFloat(r.credit) > 0);

  if (!debitRow || !creditRow) {
    throw new Error(`Ledger rows not balanced: ${JSON.stringify(rows)}`);
  }
  if (debitRow.debit !== creditRow.credit) {
    throw new Error(`Ledger imbalance: debit=${debitRow.debit} vs credit=${creditRow.credit}`);
  }

  console.log(`  [OK] Ledger balanced: debit=${debitRow.debit} = credit=${creditRow.credit}`);
}

async function assertAuditLog(
  sql: ReturnType<typeof postgres>,
  depositId: string,
): Promise<void> {
  const rows = await sql<{ hash: string; action: string }[]>`
    SELECT hash, action FROM audit_log
    WHERE action = 'deposit.credit' AND resource_id = ${depositId}
    LIMIT 1
  `;

  if (rows.length === 0) {
    throw new Error(`No audit_log row for deposit ${depositId}`);
  }
  const row = rows[0];
  if (!row.hash || row.hash === '') {
    throw new Error(`audit_log row has empty hash — DB trigger not firing?`);
  }
  console.log(`  [OK] Audit log hash: ${row.hash.slice(0, 16)}…`);
}

async function assertIdempotency(
  adminApiBase: string,
  svcToken: string,
  depositId: string,
): Promise<void> {
  const res = await fetch(`${adminApiBase}/internal/deposits/${depositId}/credit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${svcToken}` },
  });

  if (res.status !== 409) {
    throw new Error(`Expected 409 on second credit, got ${res.status}`);
  }
  console.log(`  [OK] Idempotency: second credit returned 409`);
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const adminApiBase = cfg.ADMIN_API_BASE_URL;
  const svcToken = cfg.SVC_BEARER_TOKEN;

  const db = makeDb(cfg.DATABASE_URL);
  const sql = postgres(cfg.DATABASE_URL);
  const startTime = Date.now();

  console.log('=== Vertical Slice E2E Test ===\n');

  // Step 1: Resolve test user
  let userId = values['user-id'];
  if (!userId) {
    console.log('Resolving test user from DB…');
    userId = await resolveTestUser(sql);
  }
  console.log(`Test user: ${userId}`);

  const chain = (values['chain'] ?? 'bnb') as 'bnb' | 'sol';
  const token = (values['token'] ?? 'USDT') as 'USDT' | 'USDC';
  const amount = values['amount'] ?? '1000';
  const txHash = `test_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  // Step 2: Insert synthetic deposit
  console.log(`\nStep 1: Inserting deposit row (chain=${chain} token=${token} amount=${amount})…`);
  const [row] = await db
    .insert(schema.deposits)
    .values({ userId, chain, token, amount, txHash, status: 'pending', confirmedBlocks: 0 })
    .returning();

  if (!row) throw new Error('Failed to insert deposit row');
  const depositId = row.id;
  console.log(`  Deposit inserted: id=${depositId} txHash=${txHash}`);

  // Step 3: Enqueue BullMQ job with simulated=true
  console.log('\nStep 2: Enqueuing BullMQ job…');
  const redis = new IORedis(cfg.REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue('deposit_confirm', { connection: redis });
  await queue.add(
    'deposit_confirm',
    { depositId, chain, txHash, detectedAtBlock: 0, simulated: true },
    { jobId: `deposit:${txHash}` },
  );
  await queue.close();
  await redis.quit();
  console.log('  Job enqueued');

  // Step 4: Poll for credited status
  console.log(`\nStep 3: Polling for status=credited (timeout ${TIMEOUT_SECS}s)…`);
  const depositRow = await pollDepositStatus(adminApiBase, svcToken, depositId, 'credited', TIMEOUT_SECS * 1000);
  console.log(`\n  [OK] status=credited`);

  // Step 5: Assert tx_hash
  const returnedHash = depositRow['txHash'] as string;
  if (!returnedHash) throw new Error('txHash is null on credited deposit');
  console.log(`  [OK] txHash present: ${returnedHash}`);

  // Step 6: Ledger entries
  console.log('\nStep 4: Asserting ledger entries…');
  await assertLedgerEntries(sql, txHash);

  // Step 7: Audit log
  console.log('\nStep 5: Asserting audit log…');
  await assertAuditLog(sql, depositId);

  // Step 8: Idempotency
  console.log('\nStep 6: Asserting idempotency…');
  await assertIdempotency(adminApiBase, svcToken, depositId);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n=== PASS — vertical slice completed in ${elapsed}s ===`);

  const dbClient = (db as unknown as { $client: { end: () => Promise<void> } }).$client;
  await dbClient.end();
  await sql.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n=== FAIL ===');
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
