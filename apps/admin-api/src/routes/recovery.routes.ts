import { StuckTxListResponse } from '@wp/shared-types';
// Recovery routes — stuck-tx detection, gas bump, cancel-replace
// All write routes gated by RECOVERY_ENABLED env + requirePerm('recovery.write')
// Phase 02 owns: GET /recovery/stuck
// Phase 03 appends: POST /recovery/:entityType/:entityId/bump
// Phase 04 appends: POST /recovery/:entityType/:entityId/cancel
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePerm } from '../auth/rbac.middleware.js';
import type { Db } from '../db/index.js';
import { listStuckTxs } from '../services/recovery-stuck-scanner.service.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function recoveryEnabled(): boolean {
  return process.env.RECOVERY_ENABLED !== 'false';
}

function getStuckConfig() {
  return {
    evmStuckMinutes: Number(process.env.RECOVERY_EVM_STUCK_MINUTES ?? '10'),
    solanaStuckSeconds: Number(process.env.RECOVERY_SOL_STUCK_SECONDS ?? '60'),
    maxBumps: Number(process.env.RECOVERY_MAX_BUMPS ?? '3'),
  };
}

// ── Plugin ────────────────────────────────────────────────────────────────────

const recoveryRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // ── GET /recovery/stuck ───────────────────────────────────────────────────
  r.get(
    '/recovery/stuck',
    {
      preHandler: requirePerm('recovery.read'),
      schema: {
        tags: ['recovery'],
        querystring: z.object({
          entityType: z.enum(['withdrawal', 'sweep', 'all']).optional().default('all'),
        }),
        response: {
          200: StuckTxListResponse,
          503: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      if (!recoveryEnabled()) {
        return reply
          .code(503)
          .send({ code: 'RECOVERY_DISABLED', message: 'Recovery feature is disabled' });
      }

      const config = getStuckConfig();
      const result = await listStuckTxs(app.db, config);

      // Filter by entityType if caller requested a specific kind
      const { entityType } = req.query;
      const items =
        entityType === 'all'
          ? result.items
          : result.items.filter((i) => i.entityType === entityType);

      return reply.code(200).send({ items, thresholdsUsed: result.thresholdsUsed });
    }
  );
};

export default recoveryRoutes;
