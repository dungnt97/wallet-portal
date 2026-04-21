// Recovery routes — stuck-tx detection, gas bump, cancel-replace
// All write routes gated by RECOVERY_ENABLED env + requirePerm('recovery.write')
// Phase 02 owns: GET /recovery/stuck
// Phase 03 appends: POST /recovery/:entityType/:entityId/bump
// Phase 04 appends: POST /recovery/:entityType/:entityId/cancel
import { BumpTxRequest, BumpTxResponse, StuckTxListResponse } from '@wp/shared-types';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePerm } from '../auth/rbac.middleware.js';
import { notifyStaff } from '../services/notify-staff.service.js';
import {
  AlreadyFinalError,
  BumpRateLimitError,
  ColdTierNotSupportedError,
  GasOracleError,
  NotFoundError,
  RebalanceNotSupportedError,
  RecoveryDisabledError,
  bumpTx,
} from '../services/recovery-bump.service.js';
import { SolanaCannotCancelError, cancelTx } from '../services/recovery-cancel.service.js';
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

  // ── POST /recovery/:entityType/:entityId/bump ─────────────────────────────
  r.post(
    '/recovery/:entityType/:entityId/bump',
    {
      preHandler: requirePerm('recovery.write'),
      schema: {
        tags: ['recovery'],
        params: z.object({
          entityType: z.enum(['withdrawal', 'sweep']),
          entityId: z.string().uuid(),
        }),
        body: BumpTxRequest,
        response: {
          200: BumpTxResponse,
          403: z.object({ code: z.string(), message: z.string() }),
          404: z.object({ code: z.string(), message: z.string() }),
          409: z.object({ code: z.string(), message: z.string() }),
          429: z.object({ code: z.string(), message: z.string() }),
          503: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const staffId = (req.session.staff ?? { id: '' }).id;
      const { entityType, entityId } = req.params;
      const { idempotencyKey } = req.body;

      // Build notifyFn that fans out to treasurer + admin roles
      const makeNotify = (actionId: string, title: string, body: string) =>
        notifyStaff(
          app.db,
          app.io,
          {
            role: 'treasurer',
            eventType: 'recovery.bump',
            severity: 'critical',
            title,
            body,
            dedupeKey: actionId,
          },
          app.emailQueue,
          app.slackQueue
        );

      try {
        const result = await bumpTx(
          app.db,
          { entityType, entityId, staffId, idempotencyKey },
          ({ title, body, actionId }) => makeNotify(actionId, title, body)
        );

        // Emit Socket.io event so UI refreshes without polling
        app.io.of('/stream').emit('recovery.bump.submitted', {
          entityType,
          entityId,
          actionId: result.actionId,
          newTxHash: result.newTxHash,
        });

        return reply.code(200).send({
          ok: true,
          actionId: result.actionId,
          newTxHash: result.newTxHash,
          bumpCount: result.bumpCount,
        });
      } catch (err) {
        if (err instanceof RecoveryDisabledError) {
          return reply.code(503).send({ code: err.code, message: err.message });
        }
        if (err instanceof ColdTierNotSupportedError || err instanceof RebalanceNotSupportedError) {
          return reply.code(403).send({ code: err.code, message: err.message });
        }
        if (err instanceof NotFoundError) {
          return reply.code(404).send({ code: err.code, message: err.message });
        }
        if (err instanceof AlreadyFinalError) {
          return reply.code(409).send({ code: err.code, message: err.message });
        }
        if (err instanceof BumpRateLimitError) {
          return reply.code(429).send({ code: err.code, message: err.message });
        }
        if (err instanceof GasOracleError) {
          return reply.code(503).send({ code: err.code, message: err.message });
        }
        throw err;
      }
    }
  );

  // ── POST /recovery/:entityType/:entityId/cancel ───────────────────────────
  r.post(
    '/recovery/:entityType/:entityId/cancel',
    {
      preHandler: requirePerm('recovery.write'),
      schema: {
        tags: ['recovery'],
        params: z.object({
          entityType: z.enum(['withdrawal', 'sweep']),
          entityId: z.string().uuid(),
        }),
        body: z.object({ idempotencyKey: z.string().min(1).max(128) }),
        response: {
          200: z.object({
            ok: z.literal(true),
            actionId: z.string().uuid(),
            cancelTxHash: z.string(),
          }),
          403: z.object({ code: z.string(), message: z.string() }),
          404: z.object({ code: z.string(), message: z.string() }),
          409: z.object({ code: z.string(), message: z.string() }),
          410: z.object({ code: z.string(), message: z.string(), remedy: z.string().optional() }),
          503: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const staffId = (req.session.staff ?? { id: '' }).id;
      const { entityType, entityId } = req.params;
      const { idempotencyKey } = req.body;

      const makeNotify = (actionId: string, title: string, body: string) =>
        notifyStaff(
          app.db,
          app.io,
          {
            role: 'treasurer',
            eventType: 'recovery.cancel',
            severity: 'critical',
            title,
            body,
            dedupeKey: actionId,
          },
          app.emailQueue,
          app.slackQueue
        );

      try {
        const result = await cancelTx(
          app.db,
          { entityType, entityId, staffId, idempotencyKey },
          ({ title, body, actionId }) => makeNotify(actionId, title, body)
        );

        app.io.of('/stream').emit('recovery.cancel.submitted', {
          entityType,
          entityId,
          actionId: result.actionId,
          cancelTxHash: result.cancelTxHash,
        });

        return reply.code(200).send({
          ok: true,
          actionId: result.actionId,
          cancelTxHash: result.cancelTxHash,
        });
      } catch (err) {
        if (err instanceof RecoveryDisabledError) {
          return reply.code(503).send({ code: err.code, message: err.message });
        }
        if (err instanceof SolanaCannotCancelError) {
          return reply.code(410).send({
            code: err.code,
            message: err.message,
            remedy: err.remedy,
          });
        }
        if (err instanceof ColdTierNotSupportedError) {
          return reply.code(403).send({ code: err.code, message: err.message });
        }
        if (err instanceof NotFoundError) {
          return reply.code(404).send({ code: err.code, message: err.message });
        }
        if (err instanceof AlreadyFinalError) {
          return reply.code(409).send({ code: err.code, message: err.message });
        }
        if (err instanceof GasOracleError) {
          return reply.code(503).send({ code: err.code, message: err.message });
        }
        throw err;
      }
    }
  );
};

export default recoveryRoutes;
