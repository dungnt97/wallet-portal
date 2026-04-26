// Ops health aggregator — GET /ops/health
// Returns per-component status: db, redis, policyEngine, chains, queues, workers.
// All probes run in parallel with a 2s timeout each.
// Requires authenticated staff (any role) — no step-up needed for reads.
import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireAuth } from '../auth/rbac.middleware.js';
import * as schema from '../db/schema/index.js';
import {
  checkDegradationTransition,
  probeChain,
  probeDb,
  probePolicyEngine,
  probeQueue,
  probeRedis,
  probeWorkers,
} from '../services/health-probes.service.js';
import { notifyStaff } from '../services/notify-staff.service.js';

// ── Response schema ───────────────────────────────────────────────────────────

const ProbeStatusSchema = z.enum(['ok', 'error']);

const ChainSchema = z.object({
  id: z.string(),
  rpc: z.string(),
  latestBlock: z.number().nullable(),
  checkpointBlock: z.number().nullable(),
  lagBlocks: z.number().nullable(),
  watcherIdle: z.boolean().optional(),
  status: ProbeStatusSchema,
  error: z.string().optional(),
});

const QueueSchema = z.object({
  name: z.string(),
  depth: z.number(),
  status: ProbeStatusSchema,
  error: z.string().optional(),
});

const WorkerSchema = z.object({
  name: z.string(),
  lastHeartbeatAgoSec: z.number().nullable(),
  status: ProbeStatusSchema,
  error: z.string().optional(),
});

const ComponentSchema = z.object({
  status: ProbeStatusSchema,
  error: z.string().optional(),
});

const HealthResponseSchema = z.object({
  db: ComponentSchema,
  redis: ComponentSchema,
  policyEngine: ComponentSchema,
  chains: z.array(ChainSchema),
  queues: z.array(QueueSchema),
  workers: z.array(WorkerSchema),
});

const opsHealthRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/ops/health',
    {
      preHandler: requireAuth(),
      schema: {
        tags: ['ops'],
        response: { 200: HealthResponseSchema },
      },
    },
    async (_req, reply) => {
      const policyEngineUrl = process.env.POLICY_ENGINE_URL ?? 'http://localhost:3003';

      // Chain probe configs — lazy block-number fetch via raw fetch (avoids viem dependency in admin-api)
      const bnbRpc = process.env.BNB_RPC_URL ?? 'https://bsc-testnet-rpc.publicnode.com';
      const solRpc = process.env.SOL_RPC_URL ?? 'https://api.devnet.solana.com';

      const chainProbeConfigs = [
        {
          id: 'bnb',
          rpc: bnbRpc,
          getLatestBlock: async () => {
            const res = await fetch(bnbRpc, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'eth_blockNumber',
                params: [],
              }),
              signal: AbortSignal.timeout(1_500),
            });
            const data = (await res.json()) as { result?: string };
            return Number.parseInt(data.result ?? '0x0', 16);
          },
        },
        {
          id: 'sol',
          rpc: solRpc,
          getLatestBlock: async () => {
            const res = await fetch(solRpc, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSlot', params: [] }),
              signal: AbortSignal.timeout(1_500),
            });
            const data = (await res.json()) as { result?: number };
            return data.result ?? 0;
          },
        },
      ];

      // Run all probes in parallel — settled so a single failure doesn't abort the rest
      const [dbResult, redisResult, policyResult, ...rest] = await Promise.allSettled([
        probeDb(app.db),
        probeRedis(app.redis),
        probePolicyEngine(policyEngineUrl),
        ...chainProbeConfigs.map((c) => probeChain(app.db, c)),
        probeQueue(app.queue),
        probeQueue(app.sweepQueue),
        probeWorkers(app.redis),
      ]);

      // Helper: unwrap settled result or return error fallback
      function unwrap<T>(result: PromiseSettledResult<T>, fallback: T): T {
        return result.status === 'fulfilled' ? result.value : fallback;
      }

      const chainResults = rest.slice(0, chainProbeConfigs.length).map((r) =>
        unwrap(r as PromiseSettledResult<Awaited<ReturnType<typeof probeChain>>>, {
          id: 'unknown',
          rpc: '',
          latestBlock: null,
          checkpointBlock: null,
          lagBlocks: null,
          status: 'error' as const,
          error: 'probe failed',
        })
      );

      const queueResults = rest
        .slice(chainProbeConfigs.length, chainProbeConfigs.length + 2)
        .map((r) =>
          unwrap(r as PromiseSettledResult<Awaited<ReturnType<typeof probeQueue>>>, {
            name: 'unknown',
            depth: 0,
            status: 'error' as const,
            error: 'probe failed',
          })
        );

      const workerResult = rest[chainProbeConfigs.length + 2];
      const workerResults = unwrap(
        workerResult as PromiseSettledResult<Awaited<ReturnType<typeof probeWorkers>>>,
        [
          {
            name: 'unknown',
            lastHeartbeatAgoSec: null,
            status: 'error' as const,
            error: 'probe failed',
          },
        ]
      );

      const dbProbe = unwrap(
        dbResult as PromiseSettledResult<Awaited<ReturnType<typeof probeDb>>>,
        { status: 'error' as const, error: 'probe failed' }
      );
      const redisProbe = unwrap(
        redisResult as PromiseSettledResult<Awaited<ReturnType<typeof probeRedis>>>,
        { status: 'error' as const, error: 'probe failed' }
      );
      const policyProbe = unwrap(
        policyResult as PromiseSettledResult<Awaited<ReturnType<typeof probePolicyEngine>>>,
        { status: 'error' as const, error: 'probe failed' }
      );

      // Fire health.degraded notifications for fresh ok→error transitions (ops + admins)
      const degradedComponents: string[] = [];
      if (checkDegradationTransition('db', dbProbe.status)) degradedComponents.push('db');
      if (checkDegradationTransition('redis', redisProbe.status)) degradedComponents.push('redis');
      if (checkDegradationTransition('policyEngine', policyProbe.status))
        degradedComponents.push('policyEngine');
      for (const chain of chainResults) {
        if (checkDegradationTransition(`chain:${chain.id}`, chain.status))
          degradedComponents.push(`chain:${chain.id}`);
      }
      for (const q of queueResults) {
        if (checkDegradationTransition(`queue:${q.name}`, q.status))
          degradedComponents.push(`queue:${q.name}`);
      }
      for (const w of workerResults) {
        if (checkDegradationTransition(`worker:${w.name}`, w.status))
          degradedComponents.push(`worker:${w.name}`);
      }

      if (degradedComponents.length > 0) {
        for (const role of ['ops', 'admin'] as const) {
          notifyStaff(
            app.db,
            app.io,
            {
              role,
              eventType: 'health.degraded',
              severity: 'critical',
              title: 'System health degraded',
              body: `Components degraded: ${degradedComponents.join(', ')}`,
              payload: { components: degradedComponents },
            },
            app.emailQueue,
            app.slackQueue
          ).catch((err) => app.log.error({ err }, 'notifyStaff failed'));
        }
      }

      // Auto-resolve: when every component is healthy, mark stale (>1h) unread
      // health.degraded rows as read so the dashboard "Active alerts" panel doesn't
      // show yesterday's blip indefinitely.
      const everythingOk =
        dbProbe.status === 'ok' &&
        redisProbe.status === 'ok' &&
        policyProbe.status === 'ok' &&
        chainResults.every((c) => c.status === 'ok') &&
        queueResults.every((q) => q.status === 'ok') &&
        workerResults.every((w) => w.status === 'ok');

      if (everythingOk) {
        try {
          const staleCutoff = new Date(Date.now() - 60 * 60 * 1000);
          const promise = app.db
            .update(schema.notifications)
            .set({ readAt: sql`now()` })
            .where(
              and(
                eq(schema.notifications.eventType, 'health.degraded'),
                isNull(schema.notifications.readAt),
                lt(schema.notifications.createdAt, staleCutoff)
              )
            );
          if (promise && typeof (promise as { catch?: unknown }).catch === 'function') {
            (promise as Promise<unknown>).catch((err) =>
              app.log.error({ err }, 'auto-resolve health.degraded failed')
            );
          }
        } catch (err) {
          app.log.error({ err }, 'auto-resolve health.degraded threw');
        }
      }

      return reply.code(200).send({
        db: dbProbe,
        redis: redisProbe,
        policyEngine: policyProbe,
        chains: chainResults,
        queues: queueResults,
        workers: workerResults,
      });
    }
  );
};

export default opsHealthRoutes;
