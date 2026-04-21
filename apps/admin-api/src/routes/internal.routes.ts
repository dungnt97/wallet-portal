import { timingSafeEqual } from 'node:crypto';
// Internal routes — service-to-service endpoints protected by shared bearer token (D4)
// POST /internal/deposits/:id/credit        — credited by wallet-engine after confirmation
// POST /internal/withdrawals/:id/broadcasted — wallet-engine signals tx broadcast
// POST /internal/withdrawals/:id/confirmed  — wallet-engine signals tx confirmed
// POST /internal/sweeps/:id/broadcasted     — wallet-engine signals sweep tx broadcast
// POST /internal/sweeps/:id/confirmed       — wallet-engine signals sweep tx confirmed
//
// Bearer check runs at onRequest (before body parsing) so 401 is returned before
// Zod body validation fires. This prevents leaking whether a route exists to unauthenticated callers.
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { emitDepositCredited } from '../events/emit-deposit-credited.js';
import { ConflictError, NotFoundError, creditDeposit } from '../services/deposit-credit.service.js';
import {
  NotFoundError as SwNotFoundError,
  recordSweepBroadcasted,
  recordSweepConfirmed,
} from '../services/sweep-create.service.js';
import {
  NotFoundError as WdNotFoundError,
  recordBroadcasted,
  recordConfirmed,
} from '../services/withdrawal-execute.service.js';

const internalRoutes: FastifyPluginAsync<{ bearerToken: string }> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // Plugin-level onRequest hook — fires before body parsing/validation for all /internal/* routes
  app.addHook('onRequest', async (request, reply) => {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({
        code: 'MISSING_BEARER',
        message: 'Authorization: Bearer <token> header required',
      });
    }

    const provided = authHeader.slice(7);
    const expected = opts.bearerToken;

    // Constant-time compare (Decision D4) — pad both to same length to avoid length oracle
    const a = Buffer.from(provided.padEnd(64));
    const b = Buffer.from(expected.padEnd(64));
    const valid =
      provided.length === expected.length && timingSafeEqual(a.subarray(0, 64), b.subarray(0, 64));

    if (!valid) {
      return reply.code(401).send({
        code: 'INVALID_BEARER',
        message: 'Invalid or expired bearer token',
      });
    }
  });

  // ── POST /internal/deposits/:id/credit ────────────────────────────────────────
  // Called by wallet-engine BullMQ worker after N confirmations
  r.post(
    '/internal/deposits/:id/credit',
    {
      schema: {
        tags: ['internal'],
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({ ok: z.boolean(), depositId: z.string().uuid() }),
          401: z.object({ code: z.string(), message: z.string() }),
          404: z.object({ code: z.string(), message: z.string() }),
          409: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      try {
        const result = await creditDeposit(app.db, req.params.id);
        // Emit real-time event to all connected UI clients
        emitDepositCredited(app.io, result);
        return reply.code(200).send({ ok: true, depositId: result.id });
      } catch (err) {
        if (err instanceof NotFoundError) {
          return reply.code(404).send({ code: err.code, message: err.message });
        }
        if (err instanceof ConflictError) {
          return reply.code(409).send({ code: err.code, message: err.message });
        }
        throw err;
      }
    }
  );

  // ── POST /internal/withdrawals/:id/broadcasted ────────────────────────────────
  // Called by wallet-engine after the Safe/Squads tx is submitted to the network
  r.post(
    '/internal/withdrawals/:id/broadcasted',
    {
      schema: {
        tags: ['internal'],
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          txHash: z.string().min(1),
        }),
        response: {
          200: z.object({ ok: z.boolean() }),
          401: z.object({ code: z.string(), message: z.string() }),
          404: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      try {
        await recordBroadcasted(app.db, req.params.id, { txHash: req.body.txHash }, app.io);
        return reply.code(200).send({ ok: true });
      } catch (err) {
        if (err instanceof WdNotFoundError) {
          return reply.code(404).send({ code: err.code, message: err.message });
        }
        throw err;
      }
    }
  );

  // ── POST /internal/withdrawals/:id/confirmed ──────────────────────────────────
  // Called by wallet-engine after the tx reaches required confirmations on-chain
  r.post(
    '/internal/withdrawals/:id/confirmed',
    {
      schema: {
        tags: ['internal'],
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({ ok: z.boolean() }),
          401: z.object({ code: z.string(), message: z.string() }),
          404: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      try {
        await recordConfirmed(app.db, req.params.id, app.io);
        return reply.code(200).send({ ok: true });
      } catch (err) {
        if (err instanceof WdNotFoundError) {
          return reply.code(404).send({ code: err.code, message: err.message });
        }
        throw err;
      }
    }
  );
  // ── POST /internal/sweeps/:id/broadcasted ────────────────────────────────
  // Called by wallet-engine after HD-signed sweep tx is submitted to the network
  r.post(
    '/internal/sweeps/:id/broadcasted',
    {
      schema: {
        tags: ['internal'],
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ txHash: z.string().min(1) }),
        response: {
          200: z.object({ ok: z.boolean() }),
          401: z.object({ code: z.string(), message: z.string() }),
          404: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      try {
        await recordSweepBroadcasted(app.db, req.params.id, req.body.txHash, app.io);
        return reply.code(200).send({ ok: true });
      } catch (err) {
        if (err instanceof SwNotFoundError) {
          return reply.code(404).send({ code: err.code, message: err.message });
        }
        throw err;
      }
    }
  );

  // ── POST /internal/sweeps/:id/confirmed ───────────────────────────────────
  // Called by wallet-engine after the sweep tx reaches required confirmations
  r.post(
    '/internal/sweeps/:id/confirmed',
    {
      schema: {
        tags: ['internal'],
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({ ok: z.boolean() }),
          401: z.object({ code: z.string(), message: z.string() }),
          404: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      try {
        await recordSweepConfirmed(app.db, req.params.id, app.io);
        return reply.code(200).send({ ok: true });
      } catch (err) {
        if (err instanceof SwNotFoundError) {
          return reply.code(404).send({ code: err.code, message: err.message });
        }
        throw err;
      }
    }
  );
};

export default internalRoutes;
