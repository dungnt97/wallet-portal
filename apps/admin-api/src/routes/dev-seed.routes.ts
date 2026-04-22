// dev-seed.routes.ts — lightweight test-data seeding endpoints.
// Guarded by NODE_ENV !== 'production'. NEVER register in production builds.
// Used by Playwright E2E specs to bypass business-logic constraints (policy
// engine, SAFE_ADDRESS, KYC, balances) that are irrelevant to UI testing.
//
// Endpoints:
//   POST /dev/seed/withdrawal  — inserts a withdrawal row directly (pending, hot)
//   POST /dev/seed/deposit     — inserts a deposit row directly
import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import * as schema from '../db/schema/index.js';

const devSeedRoutes: FastifyPluginAsync = async (app) => {
  // Hard-block on production — belt-and-suspenders guard so this file can
  // never be imported in a prod build even if routes/index.ts is mis-edited.
  if (process.env.NODE_ENV === 'production') {
    app.log.error('dev-seed.routes registered in production — aborting startup');
    process.exit(1);
  }

  const r = app.withTypeProvider<ZodTypeProvider>();

  // ── POST /dev/seed/withdrawal ─────────────────────────────────────────────
  // Inserts one withdrawal row without policy-engine or balance validation.
  // Requires a valid userId from the users table and a valid staffId as creator.
  r.post(
    '/dev/seed/withdrawal',
    {
      schema: {
        tags: ['dev'],
        body: z.object({
          userId: z.string().uuid(),
          createdBy: z.string().uuid(),
          chain: z.enum(['bnb', 'sol']).default('bnb'),
          token: z.enum(['USDT', 'USDC']).default('USDT'),
          amount: z.string().default('5'),
          destinationAddr: z.string().default('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'),
          sourceTier: z.enum(['hot', 'cold']).default('hot'),
        }),
        response: {
          201: z.object({ id: z.string().uuid() }),
        },
      },
    },
    async (req, reply) => {
      const { userId, createdBy, chain, token, amount, destinationAddr, sourceTier } = req.body;

      const [row] = await app.db
        .insert(schema.withdrawals)
        .values({
          userId,
          chain,
          token,
          amount,
          destinationAddr,
          status: 'pending',
          sourceTier,
          createdBy,
        })
        .returning({ id: schema.withdrawals.id });

      if (!row) throw new Error('dev/seed/withdrawal: INSERT returned no row');

      return reply.code(201).send({ id: row.id });
    }
  );

  // ── POST /dev/seed/deposit ────────────────────────────────────────────────
  // Inserts one deposit row without watcher validation.
  // Finds or creates a user to attach to the deposit.
  r.post(
    '/dev/seed/deposit',
    {
      schema: {
        tags: ['dev'],
        body: z.object({
          chain: z.enum(['bnb', 'sol']).default('bnb'),
          token: z.enum(['USDT', 'USDC']).default('USDT'),
          amount: z.string().default('10'),
          status: z.enum(['pending', 'credited', 'swept']).default('pending'),
        }),
        response: {
          201: z.object({ id: z.string().uuid() }),
        },
      },
    },
    async (req, reply) => {
      const { chain, token, amount, status } = req.body;

      // Re-use the first available user or create a minimal seed user.
      let userId: string;
      const existingUser = await app.db.query.users.findFirst();
      if (existingUser) {
        userId = existingUser.id;
      } else {
        const email = `dev-seed-${Date.now()}@example.com`;
        const [newUser] = await app.db
          .insert(schema.users)
          .values({
            email,
            kycTier: 'basic',
          })
          .returning({ id: schema.users.id });
        if (!newUser) throw new Error('dev/seed/deposit: user INSERT returned no row');
        userId = newUser.id;
      }

      const txHash = `0x${randomUUID().replace(/-/g, '')}`;

      const [row] = await app.db
        .insert(schema.deposits)
        .values({
          userId,
          chain,
          token,
          amount,
          status,
          txHash,
          confirmedBlocks: status === 'pending' ? 0 : 15,
        })
        .returning({ id: schema.deposits.id });

      if (!row) throw new Error('dev/seed/deposit: INSERT returned no row');

      return reply.code(201).send({ id: row.id });
    }
  );
};

export default devSeedRoutes;
