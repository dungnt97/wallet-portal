// Internal routes — service-to-service endpoints protected by shared bearer token (D4)
// POST /internal/deposits/:id/credit — credited by wallet-engine after confirmation (wired P09)
//
// Bearer check runs at onRequest (before body parsing) so 401 is returned before
// Zod body validation fires. This prevents leaking whether a route exists to unauthenticated callers.
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { timingSafeEqual } from 'node:crypto';

const NOT_IMPL = z.object({ code: z.string(), message: z.string() });

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
    const valid = provided.length === expected.length && timingSafeEqual(a.subarray(0, 64), b.subarray(0, 64));

    if (!valid) {
      return reply.code(401).send({
        code: 'INVALID_BEARER',
        message: 'Invalid or expired bearer token',
      });
    }
  });

  // POST /internal/deposits/:id/credit
  // Called by wallet-engine BullMQ worker after N confirmations (wired in P09)
  r.post(
    '/internal/deposits/:id/credit',
    {
      schema: {
        tags: ['internal'],
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          txHash: z.string().min(1),
          confirmedBlocks: z.number().int().nonnegative(),
          amount: z.string().regex(/^\d+(\.\d+)?$/),
        }),
        response: {
          200: z.object({ ok: z.boolean(), depositId: z.string().uuid() }),
          401: z.object({ code: z.string(), message: z.string() }),
          404: NOT_IMPL,
          501: NOT_IMPL,
        },
      },
    },
    async (_req, reply) => {
      // Stub — business logic (ledger credit + audit emit + socket push) wired in P09
      return reply.code(501).send({ code: 'NOT_IMPLEMENTED', message: 'Wired in P09' });
    },
  );
};

export default internalRoutes;
