// Rebalance routes — POST /rebalance initiates a hot→cold transfer (operation_type='hot_to_cold').
// Destination auto-resolved from wallets registry; policy whitelist fast-path applies.
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePerm } from '../auth/rbac.middleware.js';
import {
  KillSwitchEnabledError,
  NotFoundError,
  PolicyRejectedError,
  ValidationError,
  createRebalance,
} from '../services/rebalance-create.service.js';

const rebalanceRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  const getPolicyOpts = () => ({
    baseUrl: process.env.POLICY_ENGINE_URL ?? 'http://localhost:3003',
    bearerToken: process.env.SVC_BEARER_TOKEN ?? '',
    timeoutMs: 2_000,
  });

  // ── POST /rebalance ───────────────────────────────────────────────────────────
  r.post(
    '/rebalance',
    {
      // Treasurers (and admins) can initiate rebalance; requires withdrawal.create permission
      preHandler: requirePerm('withdrawals.create'),
      schema: {
        tags: ['rebalance'],
        description:
          'Initiate a hot→cold rebalance. Destination cold wallet auto-resolved from registry.',
        body: z.object({
          chain: z.enum(['bnb', 'sol']),
          token: z.enum(['USDT', 'USDC']),
          amountMinor: z
            .string()
            .regex(/^\d+(\.\d+)?$/, 'amountMinor must be a positive decimal string'),
        }),
        response: {
          201: z.object({
            withdrawalId: z.string().uuid(),
            multisigOpId: z.string().uuid(),
            destinationAddr: z.string(),
            status: z.string(),
          }),
          403: z.object({
            code: z.string(),
            message: z.string(),
            reasons: z.array(z.object({ rule: z.string(), message: z.string() })).optional(),
          }),
          404: z.object({ code: z.string(), message: z.string() }),
          422: z.object({ code: z.string(), message: z.string() }),
          503: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const staffId = (req.session.staff ?? { id: '' }).id;
      try {
        const result = await createRebalance(app.db, req.body, staffId, app.io, getPolicyOpts());
        return reply.code(201).send({
          withdrawalId: result.withdrawal.id,
          multisigOpId: result.multisigOp.id,
          destinationAddr: result.destinationAddr,
          status: result.withdrawal.status,
        });
      } catch (err) {
        if (err instanceof PolicyRejectedError) {
          return reply
            .code(403)
            .send({ code: err.code, message: err.message, reasons: err.reasons });
        }
        if (err instanceof NotFoundError) {
          return reply.code(404).send({ code: err.code, message: err.message });
        }
        if (err instanceof ValidationError) {
          return reply.code(422).send({ code: err.code, message: err.message });
        }
        if (err instanceof KillSwitchEnabledError) {
          return reply
            .code(503)
            .send({ code: 'KILL_SWITCH_ENABLED', message: (err as Error).message });
        }
        throw err;
      }
    }
  );
};

export default rebalanceRoutes;
