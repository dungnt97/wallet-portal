// Internal multisig sync routes — bearer-protected, called by admin-api proxy.
//
// GET  /internal/multisig/sync-status   — return cached or fresh RPC probe results
// POST /internal/multisig/sync-refresh  — bust Redis cache + re-probe immediately
//
// BNB:  reads nonce() from Gnosis Safe contract via ethers FallbackProvider.
// SOL:  checks Squads multisig PDA account exists via web3.js getAccountInfo.
// Results cached 60s in Redis; stale = lastSyncAt > 5 min ago served from cache.
import { timingSafeEqual } from 'node:crypto';
import type { Connection } from '@solana/web3.js';
import type { FallbackProvider } from 'ethers';
import type { FastifyPluginAsync } from 'fastify';
import type IORedis from 'ioredis';
import { z } from 'zod';
import { type SyncProbeConfig, getMultisigSyncStatus } from '../services/multisig-sync-probe.js';

// ── Response schema (shared between GET + POST) ───────────────────────────────

const ChainSyncSchema = z.object({
  status: z.enum(['synced', 'stale', 'error']),
  lastSyncAt: z.string().datetime(),
  nonce: z.number().int().optional(),
});

const SyncStatusResponseSchema = z.object({
  bnb: ChainSyncSchema,
  sol: ChainSyncSchema,
});

// ── Plugin options ─────────────────────────────────────────────────────────────

export interface InternalMultisigSyncPluginOpts {
  bearerToken: string;
  redis: IORedis;
  bnbProvider: FallbackProvider;
  solanaConnection: Connection;
  /** BNB Gnosis Safe contract address — empty string disables BNB probe */
  safeAddress: string;
  /** Solana Squads multisig PDA — empty string disables SOL probe */
  squadsPda: string;
}

const internalMultisigSyncPlugin: FastifyPluginAsync<InternalMultisigSyncPluginOpts> = async (
  app,
  opts
) => {
  const { bearerToken, redis, bnbProvider, solanaConnection, safeAddress, squadsPda } = opts;

  // Warn on startup if addresses are missing — routes still register and return 'error' status
  if (!safeAddress) {
    app.log.warn('SAFE_ADDRESS not configured — BNB sync probe will always return error');
  }
  if (!squadsPda) {
    app.log.warn(
      'SQUADS_MULTISIG_ADDRESS not configured — SOL sync probe will always return error'
    );
  }

  // Plugin-level bearer auth (fires before body parsing on all routes in this plugin)
  app.addHook('onRequest', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply
        .code(401)
        .send({ code: 'MISSING_BEARER', message: 'Authorization: Bearer <token> required' });
    }
    const provided = authHeader.slice(7);
    const a = Buffer.from(provided.padEnd(64));
    const b = Buffer.from(bearerToken.padEnd(64));
    const valid =
      provided.length === bearerToken.length &&
      timingSafeEqual(a.subarray(0, 64), b.subarray(0, 64));
    if (!valid) {
      return reply
        .code(401)
        .send({ code: 'INVALID_BEARER', message: 'Invalid or expired bearer token' });
    }
  });

  const probeCfg: SyncProbeConfig = {
    bnbProvider,
    solanaConnection,
    safeAddress: safeAddress || '0x0000000000000000000000000000000000000000',
    squadsPda: squadsPda || '11111111111111111111111111111111',
  };

  // ── GET /internal/multisig/sync-status ────────────────────────────────────────
  app.get(
    '/internal/multisig/sync-status',
    {
      schema: {
        response: {
          200: SyncStatusResponseSchema,
          401: z.object({ code: z.string(), message: z.string() }),
          500: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (_req, reply) => {
      try {
        const result = await getMultisigSyncStatus(redis, probeCfg, false);
        return reply.code(200).send(result);
      } catch (err) {
        app.log.error({ err }, 'multisig sync-status probe failed');
        return reply.code(500).send({ code: 'PROBE_FAILED', message: String(err) });
      }
    }
  );

  // ── POST /internal/multisig/sync-refresh ─────────────────────────────────────
  // Busts the Redis cache and re-probes both chains immediately.
  app.post(
    '/internal/multisig/sync-refresh',
    {
      schema: {
        response: {
          200: SyncStatusResponseSchema,
          401: z.object({ code: z.string(), message: z.string() }),
          500: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (_req, reply) => {
      try {
        const result = await getMultisigSyncStatus(redis, probeCfg, true /* bustCache */);
        return reply.code(200).send(result);
      } catch (err) {
        app.log.error({ err }, 'multisig sync-refresh probe failed');
        return reply.code(500).send({ code: 'PROBE_FAILED', message: String(err) });
      }
    }
  );
};

export default internalMultisigSyncPlugin;
