import type { Queue } from 'bullmq';
// health-probes.service — individual component probes for GET /ops/health.
// Each probe resolves to a typed status object; caller runs them in parallel via Promise.allSettled.
import { eq } from 'drizzle-orm';
import type Redis from 'ioredis';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';

// ── Shared timeout helper ─────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`probe timed out after ${ms}ms`)), ms)
    ),
  ]);
}

const PROBE_TIMEOUT_MS = 2_000;

// ── Result types ──────────────────────────────────────────────────────────────

export type ProbeStatus = 'ok' | 'error';

export interface DbProbeResult {
  status: ProbeStatus;
  error?: string;
}

export interface RedisProbeResult {
  status: ProbeStatus;
  error?: string;
}

export interface PolicyEngineProbeResult {
  status: ProbeStatus;
  error?: string;
}

export interface ChainProbeResult {
  id: string;
  rpc: string;
  latestBlock: number | null;
  checkpointBlock: number | null;
  lagBlocks: number | null;
  status: ProbeStatus;
  error?: string;
}

export interface QueueProbeResult {
  name: string;
  depth: number;
  status: ProbeStatus;
  error?: string;
}

export interface WorkerProbeResult {
  name: string;
  lastHeartbeatAgoSec: number | null;
  status: ProbeStatus;
  error?: string;
}

// ── DB probe ──────────────────────────────────────────────────────────────────

export async function probeDb(db: Db): Promise<DbProbeResult> {
  try {
    await withTimeout(
      db.execute('SELECT 1' as unknown as Parameters<typeof db.execute>[0]),
      PROBE_TIMEOUT_MS
    );
    return { status: 'ok' };
  } catch (err) {
    return { status: 'error', error: String(err) };
  }
}

// ── Redis probe ───────────────────────────────────────────────────────────────

export async function probeRedis(redis: Redis): Promise<RedisProbeResult> {
  try {
    await withTimeout(redis.ping(), PROBE_TIMEOUT_MS);
    return { status: 'ok' };
  } catch (err) {
    return { status: 'error', error: String(err) };
  }
}

// ── Policy Engine probe ───────────────────────────────────────────────────────

export async function probePolicyEngine(policyEngineUrl: string): Promise<PolicyEngineProbeResult> {
  try {
    const url = `${policyEngineUrl}/healthz`;
    const res = await withTimeout(
      fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) }),
      PROBE_TIMEOUT_MS
    );
    if (!res.ok) return { status: 'error', error: `HTTP ${res.status}` };
    return { status: 'ok' };
  } catch (err) {
    return { status: 'error', error: String(err) };
  }
}

// ── Chain probes ──────────────────────────────────────────────────────────────

export interface ChainProbeConfig {
  id: string;
  rpc: string;
  getLatestBlock: () => Promise<number>;
}

export async function probeChain(db: Db, cfg: ChainProbeConfig): Promise<ChainProbeResult> {
  const chain = cfg.id as 'bnb' | 'sol';
  let latestBlock: number | null = null;
  let checkpointBlock: number | null = null;

  try {
    latestBlock = await withTimeout(cfg.getLatestBlock(), PROBE_TIMEOUT_MS);
  } catch (err) {
    return {
      id: cfg.id,
      rpc: cfg.rpc,
      latestBlock: null,
      checkpointBlock: null,
      lagBlocks: null,
      status: 'error',
      error: String(err),
    };
  }

  try {
    const checkpoint = await db.query.watcherCheckpoints.findFirst({
      where: eq(schema.watcherCheckpoints.chain, chain),
    });
    checkpointBlock = checkpoint?.lastBlock ?? null;
  } catch {
    // non-fatal — checkpoint may not exist yet
  }

  const lagBlocks =
    latestBlock !== null && checkpointBlock !== null ? latestBlock - checkpointBlock : null;

  return {
    id: cfg.id,
    rpc: cfg.rpc,
    latestBlock,
    checkpointBlock,
    lagBlocks,
    status: 'ok',
  };
}

// ── Queue probes ──────────────────────────────────────────────────────────────

export async function probeQueue(queue: Queue): Promise<QueueProbeResult> {
  try {
    const counts = await withTimeout(queue.getJobCounts(), PROBE_TIMEOUT_MS);
    const depth = (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0);
    return { name: queue.name, depth, status: 'ok' };
  } catch (err) {
    return { name: queue.name, depth: 0, status: 'error', error: String(err) };
  }
}

// ── Worker heartbeat probes ───────────────────────────────────────────────────

const WORKER_NAMES = ['withdrawal-execute', 'sweep-execute', 'deposit-confirm'] as const;

export async function probeWorkers(redis: Redis): Promise<WorkerProbeResult[]> {
  return Promise.all(
    WORKER_NAMES.map(async (name) => {
      try {
        const val = await withTimeout(redis.get(`worker:${name}:heartbeat`), PROBE_TIMEOUT_MS);
        if (!val) {
          return {
            name,
            lastHeartbeatAgoSec: null,
            status: 'error' as ProbeStatus,
            error: 'no heartbeat key',
          };
        }
        const ts = Number(val);
        const agoSec = Math.round((Date.now() - ts) / 1000);
        // Heartbeats expire at 60s — anything > 90s is stale
        const status: ProbeStatus = agoSec > 90 ? 'error' : 'ok';
        return { name, lastHeartbeatAgoSec: agoSec, status };
      } catch (err) {
        return {
          name,
          lastHeartbeatAgoSec: null,
          status: 'error' as ProbeStatus,
          error: String(err),
        };
      }
    })
  );
}
