// Internal HD derive endpoint — POST /internal/users/:userId/derive-addresses
// Protected by bearer token (timingSafeEqual, same pattern as admin-api internal routes).
// Idempotent: calling twice for the same user returns the same addresses.
import { timingSafeEqual } from 'node:crypto';
import * as schema from '@wp/admin-api/db-schema';
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Db } from '../db/client.js';
import { deriveUserAddresses } from '../services/hd-derive-user.js';

const DerivedAddressSchema = z.object({
  chain: z.enum(['bnb', 'sol']),
  address: z.string(),
  derivationPath: z.string(),
  derivationIndex: z.number().int().min(0),
});

export interface InternalDerivePluginOpts {
  db: Db;
  bearerToken: string;
  hdMnemonicBnb: string;
  hdSeedSolana: string;
}

const internalDerivePlugin: FastifyPluginAsync<InternalDerivePluginOpts> = async (app, opts) => {
  const { db, bearerToken, hdMnemonicBnb, hdSeedSolana } = opts;

  // Readiness guard — disable route if HD seed env vars are missing
  if (!hdMnemonicBnb || !hdSeedSolana) {
    app.log.warn(
      'HD_MASTER_XPUB_BNB or HD_MASTER_SEED_SOLANA missing — /internal/users/:userId/derive-addresses disabled'
    );
    return;
  }

  // Plugin-level bearer auth hook (fires before body parsing)
  app.addHook('onRequest', async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return reply
        .code(401)
        .send({ code: 'MISSING_BEARER', message: 'Authorization: Bearer <token> required' });
    }

    const provided = authHeader.slice(7);
    // Constant-time compare — pad to 64 bytes (mirrors admin-api internal routes pattern)
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

  // POST /internal/users/:userId/derive-addresses
  app.post<{
    Params: { userId: string };
  }>(
    '/internal/users/:userId/derive-addresses',
    {
      schema: {
        params: {
          type: 'object',
          properties: { userId: { type: 'string', format: 'uuid' } },
          required: ['userId'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              addresses: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    chain: { type: 'string', enum: ['bnb', 'sol'] },
                    address: { type: 'string' },
                    derivationPath: { type: 'string' },
                    derivationIndex: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const { userId } = req.params;

      // Verify user exists in DB before deriving
      const user = await db.query.users.findFirst({
        where: eq(schema.users.id, userId),
      });
      if (!user) {
        return reply.code(404).send({ code: 'NOT_FOUND', message: `User ${userId} not found` });
      }

      try {
        const result = await deriveUserAddresses(db, userId, hdMnemonicBnb, hdSeedSolana);
        return reply.code(200).send({ addresses: result.addresses });
      } catch (err: unknown) {
        app.log.error({ err, userId }, 'HD derivation failed');
        const message = err instanceof Error ? err.message : String(err);
        return reply.code(500).send({ code: 'DERIVE_FAILED', message });
      }
    }
  );
};

export default internalDerivePlugin;
