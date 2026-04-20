#!/usr/bin/env tsx
// simulate-deposit.ts — CLI script to insert a synthetic deposit row and enqueue a confirm job
// Usage: pnpm --filter @wp/wallet-engine simulate-deposit --user-id=<uuid> --chain=bnb --token=USDT --amount=1000
//
// This is CI/test mode ONLY — simulates the block watcher output without hitting real RPC.
// Sets simulated=true on the BullMQ job so the worker skips RPC confirmation polling.
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { makeDb } from '../src/db/client.js';
import * as schema from '@wp/admin-api/db-schema';
import { loadConfig } from '../src/config/env.js';

const { values } = parseArgs({
  options: {
    'user-id': { type: 'string' },
    chain: { type: 'string', default: 'bnb' },
    token: { type: 'string', default: 'USDT' },
    amount: { type: 'string', default: '1000' },
    'tx-hash': { type: 'string' },
  },
  strict: false,
});

const userId = values['user-id'];
const chain = (values['chain'] ?? 'bnb') as 'bnb' | 'sol';
const token = (values['token'] ?? 'USDT') as 'USDT' | 'USDC';
const amount = values['amount'] ?? '1000';
const txHash = values['tx-hash'] ?? `fake_${Date.now()}_${Math.random().toString(36).slice(2)}`;

// Validate required args
if (!userId) {
  console.error('Error: --user-id is required');
  process.exit(1);
}

if (!['bnb', 'sol'].includes(chain)) {
  console.error(`Error: --chain must be 'bnb' or 'sol', got '${chain}'`);
  process.exit(1);
}

if (!['USDT', 'USDC'].includes(token)) {
  console.error(`Error: --token must be 'USDT' or 'USDC', got '${token}'`);
  process.exit(1);
}

if (!/^\d+(\.\d+)?$/.test(amount)) {
  console.error(`Error: --amount must be a positive decimal number, got '${amount}'`);
  process.exit(1);
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const db = makeDb(cfg.DATABASE_URL);

  console.log(`Inserting synthetic deposit: user=${userId} chain=${chain} token=${token} amount=${amount} txHash=${txHash}`);

  // Insert deposit row with status=pending
  const [row] = await db
    .insert(schema.deposits)
    .values({
      userId,
      chain,
      token,
      amount,
      txHash,
      status: 'pending',
      confirmedBlocks: 0,
    })
    .returning();

  if (!row) {
    console.error('Failed to insert deposit row');
    process.exit(1);
  }

  console.log(`Deposit inserted: id=${row.id}`);

  // Enqueue BullMQ job with simulated=true (worker will skip RPC and credit immediately)
  const redis = new IORedis(cfg.REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue<{
    depositId: string;
    chain: string;
    txHash: string;
    detectedAtBlock: number;
    simulated: boolean;
  }>('deposit_confirm', {
    connection: redis,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 5_000 },
    },
  });

  const job = await queue.add(
    'deposit_confirm',
    {
      depositId: row.id,
      chain,
      txHash,
      detectedAtBlock: 0,
      simulated: true,
    },
    {
      // Idempotent job id — same tx hash cannot be double-enqueued
      jobId: `deposit:${txHash}`,
    },
  );

  console.log(`BullMQ job enqueued: jobId=${job.id} depositId=${row.id}`);
  console.log('The wallet-engine worker will credit this deposit shortly.');

  await queue.close();
  // Close the DB connection (postgres.js internal client)
  const client = (db as unknown as { $client: { end: () => Promise<void> } }).$client;
  await client.end();
  await redis.quit();
}

main().catch((err) => {
  console.error('simulate-deposit failed:', err);
  process.exit(1);
});
