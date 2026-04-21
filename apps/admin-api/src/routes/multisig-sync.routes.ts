// Multisig sync status routes — session-protected proxy to wallet-engine internal API.
//
// GET  /multisig/sync-status   — return BNB Safe nonce + SOL Squads PDA reachability
// POST /multisig/sync-refresh  — bust wallet-engine cache + re-probe both chains
//
// wallet-engine: GET/POST /internal/multisig/sync-status|sync-refresh (bearer auth)
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePerm } from '../auth/rbac.middleware.js';

// ── Shared response schema ────────────────────────────────────────────────────

const ChainSyncSchema = z.object({
  status: z.enum(['synced', 'stale', 'error']),
  lastSyncAt: z.string().datetime(),
  nonce: z.number().int().optional(),
});

const SyncStatusResponseSchema = z.object({
  bnb: ChainSyncSchema,
  sol: ChainSyncSchema,
});

// ── Error fallback (wallet-engine unreachable) ────────────────────────────────

function unreachableFallback(lastSyncAt: string) {
  return {
    bnb: { status: 'error' as const, lastSyncAt },
    sol: { status: 'error' as const, lastSyncAt },
  };
}

// ── Plugin ────────────────────────────────────────────────────────────────────

const multisigSyncRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  const walletEngineUrl = process.env.WALLET_ENGINE_URL ?? 'http://localhost:3002';
  const bearerToken = process.env.SVC_BEARER_TOKEN ?? '';

  async function callWalletEngine(
    path: string,
    method: 'GET' | 'POST'
  ): Promise<z.infer<typeof SyncStatusResponseSchema>> {
    const url = `${walletEngineUrl}${path}`;
    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${bearerToken}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(8_000),
      });

      if (!res.ok) {
        app.log.warn({ status: res.status, url }, 'wallet-engine sync probe returned non-2xx');
        return unreachableFallback(new Date().toISOString());
      }

      return (await res.json()) as z.infer<typeof SyncStatusResponseSchema>;
    } catch (err) {
      app.log.warn({ err, url }, 'wallet-engine sync probe request failed');
      return unreachableFallback(new Date().toISOString());
    }
  }

  // ── GET /multisig/sync-status ─────────────────────────────────────────────
  r.get(
    '/multisig/sync-status',
    {
      preHandler: requirePerm('multisig.read'),
      schema: {
        tags: ['multisig'],
        response: { 200: SyncStatusResponseSchema },
      },
    },
    async (_req, reply) => {
      const result = await callWalletEngine('/internal/multisig/sync-status', 'GET');
      return reply.code(200).send(result);
    }
  );

  // ── POST /multisig/sync-refresh ───────────────────────────────────────────
  // Busts wallet-engine Redis cache + re-probes both chains. Returns fresh result.
  r.post(
    '/multisig/sync-refresh',
    {
      preHandler: requirePerm('multisig.sign'),
      schema: {
        tags: ['multisig'],
        response: { 200: SyncStatusResponseSchema },
      },
    },
    async (_req, reply) => {
      const result = await callWalletEngine('/internal/multisig/sync-refresh', 'POST');
      return reply.code(200).send(result);
    }
  );
};

export default multisigSyncRoutes;
