// Internal routes — service-to-service endpoints protected by shared bearer token (D4)
// POST /internal/deposits/:id/credit — credited by wallet-engine after confirmation
//
// Bearer check runs at onRequest (before body parsing) so 401 is returned before
// Zod body validation fires. This prevents leaking whether a route exists to unauthenticated callers.
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import { creditDeposit, ConflictError, NotFoundError } from '../services/deposit-credit.service.js';
import { emitDepositCredited } from '../events/emit-deposit-credited.js';

const internalRoutes: FastifyPluginAsync<{ bearerToken: string }> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // Plugin-level onRequest hook — fires before body parsing/validation for all /internal/* routes
  app.addHook('onRequest', async (request, reply) => {
    const authHeader = request.headers['authorization'];

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
      provided.length === expected.length &&
      timingSafeEqual(a.subarray(0, 64), b.subarray(0, 64));

    if (!valid) {
      return reply.code(401).send({
        code: 'INVALID_BEARER',
        message: 'Invalid or expired bearer token',
      });
    }
  });

  // POST /internal/deposits/:id/credit
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
    },
  );
};

export default internalRoutes;
