import {
  DerivedAddress,
  UserAddress,
  UserAddressWithBalance,
  UserBalance,
  UserRecord,
} from '@wp/shared-types';
// Users routes — real implementation replacing 501 stubs (Slice 8)
// POST   /users                       — create end-user + HD derivation
// GET    /users                       — list + filter (email, kyc_tier, status, dates, page/limit)
// GET    /users/:id                   — detail with address count
// PATCH  /users/:id/kyc               — update KYC tier
// GET    /users/:id/balance           — ledger-derived balance per currency
// GET    /users/:id/addresses         — per-chain addresses + Redis-cached on-chain balance
// POST   /users/:id/derive-addresses  — idempotent retry for partial-create recovery
import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePerm } from '../auth/rbac.middleware.js';
import { requireStepUp } from '../auth/require-step-up.middleware.js';
import type { Config } from '../config/env.js';
import * as schema from '../db/schema/index.js';
import { getUserAddresses } from '../services/user-addresses-query.service.js';
import { getUserBalance } from '../services/user-balance-query.service.js';
import {
  ConflictError,
  DerivationFailedError,
  createUser,
} from '../services/user-create.service.js';
import {
  NotFoundError as KycNotFoundError,
  ValidationError as KycValidationError,
  updateUserKyc,
} from '../services/user-kyc-update.service.js';
import { listUsers } from '../services/user-list-query.service.js';
import {
  DerivationFailedError as RetryDerivationFailedError,
  NotFoundError as RetryNotFoundError,
  retryDeriveUserAddresses,
} from '../services/user-retry-derive.service.js';
import { updateRiskTier } from '../services/user-risk.service.js';

// Shared error response schema
const ErrSchema = z.object({ code: z.string(), message: z.string() });

const usersRoutes: FastifyPluginAsync<{ cfg?: Config }> = async (app, opts) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // Resolve wallet-engine opts from config (injected via app.cfg or opts.cfg)
  // app.cfg is not decorated; we read from process.env directly as done in policy-client
  const walletEngineOpts = {
    baseUrl: process.env.WALLET_ENGINE_URL ?? 'http://localhost:3002',
    bearerToken: process.env.SVC_BEARER_TOKEN ?? '',
  };

  // ── GET /users ────────────────────────────────────────────────────────────────
  r.get(
    '/users',
    {
      preHandler: requirePerm('users.read'),
      schema: {
        tags: ['users'],
        querystring: z.object({
          page: z.coerce.number().int().positive().default(1),
          limit: z.coerce.number().int().positive().max(100).default(20),
          q: z.string().optional(),
          kycTier: z.enum(['none', 'basic', 'enhanced']).optional(),
          status: z.enum(['active', 'suspended', 'closed']).optional(),
          createdFrom: z.string().optional(),
          createdTo: z.string().optional(),
        }),
        response: {
          200: z.object({
            data: z.array(UserRecord),
            total: z.number().int(),
            page: z.number().int(),
          }),
        },
      },
    },
    async (req, reply) => {
      const { page, limit, q, kycTier, status, createdFrom, createdTo } = req.query;
      const result = await listUsers(app.db, {
        page,
        limit,
        ...(q !== undefined && { q }),
        ...(kycTier !== undefined && { kycTier }),
        ...(status !== undefined && { status }),
        ...(createdFrom !== undefined && { createdFrom }),
        ...(createdTo !== undefined && { createdTo }),
      });
      return reply.code(200).send({
        data: result.data.map((u) => ({
          id: u.id,
          email: u.email,
          kycTier: u.kycTier,
          riskScore: u.riskScore,
          status: u.status,
          createdAt: u.createdAt.toISOString(),
        })),
        total: result.total,
        page: result.page,
      });
    }
  );

  // ── GET /users/:id ────────────────────────────────────────────────────────────
  r.get(
    '/users/:id',
    {
      preHandler: requirePerm('users.read'),
      schema: {
        tags: ['users'],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({
            user: UserRecord,
            addressCount: z.number().int(),
          }),
          404: ErrSchema,
        },
      },
    },
    async (req, reply) => {
      const user = await app.db.query.users.findFirst({
        where: eq(schema.users.id, req.params.id),
      });
      if (!user) {
        return reply
          .code(404)
          .send({ code: 'NOT_FOUND', message: `User ${req.params.id} not found` });
      }
      const addrRows = await app.db
        .select({ id: schema.userAddresses.id })
        .from(schema.userAddresses)
        .where(eq(schema.userAddresses.userId, user.id));

      return reply.code(200).send({
        user: {
          id: user.id,
          email: user.email,
          kycTier: user.kycTier,
          riskScore: user.riskScore,
          status: user.status,
          createdAt: user.createdAt.toISOString(),
        },
        addressCount: addrRows.length,
      });
    }
  );

  // ── POST /users ───────────────────────────────────────────────────────────────
  r.post(
    '/users',
    {
      preHandler: requirePerm('users.manage'),
      schema: {
        tags: ['users'],
        body: z.object({
          email: z.string().email(),
          kycTier: z.enum(['none', 'basic', 'enhanced']).default('none'),
        }),
        response: {
          201: z.object({ user: UserRecord, addresses: z.array(DerivedAddress) }),
          409: ErrSchema,
          502: ErrSchema.extend({ userId: z.string().uuid() }),
        },
      },
    },
    async (req, reply) => {
      const staffId = req.session.staff?.id ?? '';
      try {
        const result = await createUser(app.db, walletEngineOpts, {
          email: req.body.email,
          kycTier: req.body.kycTier,
          staffId,
          ipAddr: req.ip,
        });
        return reply.code(201).send({
          user: {
            id: result.user.id,
            email: result.user.email,
            kycTier: result.user.kycTier,
            riskScore: result.user.riskScore,
            status: result.user.status,
            createdAt: result.user.createdAt.toISOString(),
          },
          addresses: result.addresses,
        });
      } catch (err) {
        if (err instanceof ConflictError) {
          return reply.code(409).send({ code: err.code, message: err.message });
        }
        if (err instanceof DerivationFailedError) {
          return reply.code(502).send({ code: err.code, message: err.message, userId: err.userId });
        }
        throw err;
      }
    }
  );

  // ── PATCH /users/:id/kyc ──────────────────────────────────────────────────────
  r.patch(
    '/users/:id/kyc',
    {
      preHandler: requirePerm('users.manage'),
      schema: {
        tags: ['users'],
        params: z.object({ id: z.string().uuid() }),
        body: z.object({ kycTier: z.enum(['none', 'basic', 'enhanced']) }),
        response: {
          200: z.object({ user: UserRecord }),
          400: ErrSchema,
          404: ErrSchema,
        },
      },
    },
    async (req, reply) => {
      const staffId = req.session.staff?.id ?? '';
      try {
        const result = await updateUserKyc(app.db, {
          userId: req.params.id,
          kycTier: req.body.kycTier,
          staffId,
          ipAddr: req.ip,
        });
        return reply.code(200).send({
          user: {
            id: result.user.id,
            email: result.user.email,
            kycTier: result.user.kycTier,
            riskScore: result.user.riskScore,
            status: result.user.status,
            createdAt: result.user.createdAt.toISOString(),
          },
        });
      } catch (err) {
        if (err instanceof KycNotFoundError) {
          return reply.code(404).send({ code: err.code, message: err.message });
        }
        if (err instanceof KycValidationError) {
          return reply.code(400).send({ code: err.code, message: err.message });
        }
        throw err;
      }
    }
  );

  // ── GET /users/:id/balance ────────────────────────────────────────────────────
  r.get(
    '/users/:id/balance',
    {
      preHandler: requirePerm('users.read'),
      schema: {
        tags: ['users'],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: UserBalance,
          404: ErrSchema,
        },
      },
    },
    async (req, reply) => {
      // Verify user exists first
      const user = await app.db.query.users.findFirst({
        where: eq(schema.users.id, req.params.id),
      });
      if (!user) {
        return reply
          .code(404)
          .send({ code: 'NOT_FOUND', message: `User ${req.params.id} not found` });
      }
      const balance = await getUserBalance(app.db, req.params.id);
      return reply.code(200).send(balance);
    }
  );

  // ── GET /users/:id/addresses ──────────────────────────────────────────────────
  r.get(
    '/users/:id/addresses',
    {
      preHandler: requirePerm('users.read'),
      schema: {
        tags: ['users'],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({ addresses: z.array(UserAddressWithBalance) }),
          404: ErrSchema,
        },
      },
    },
    async (req, reply) => {
      const user = await app.db.query.users.findFirst({
        where: eq(schema.users.id, req.params.id),
      });
      if (!user) {
        return reply
          .code(404)
          .send({ code: 'NOT_FOUND', message: `User ${req.params.id} not found` });
      }
      const addresses = await getUserAddresses(app.db, app.redis, req.params.id);
      return reply.code(200).send({ addresses });
    }
  );

  // ── POST /users/:id/derive-addresses ─────────────────────────────────────────
  r.post(
    '/users/:id/derive-addresses',
    {
      preHandler: requirePerm('users.manage'),
      schema: {
        tags: ['users'],
        params: z.object({ id: z.string().uuid() }),
        response: {
          200: z.object({ addresses: z.array(DerivedAddress), alreadyComplete: z.boolean() }),
          404: ErrSchema,
          502: ErrSchema,
        },
      },
    },
    async (req, reply) => {
      const staffId = req.session.staff?.id ?? '';
      try {
        const result = await retryDeriveUserAddresses(
          app.db,
          walletEngineOpts,
          req.params.id,
          staffId
        );
        return reply.code(200).send(result);
      } catch (err) {
        if (err instanceof RetryNotFoundError) {
          return reply.code(404).send({ code: err.code, message: err.message });
        }
        if (err instanceof RetryDerivationFailedError) {
          return reply.code(502).send({ code: err.code, message: err.message });
        }
        throw err;
      }
    }
  );
  // ── PATCH /users/:id/risk — update risk tier (admin + WebAuthn step-up) ────
  r.patch(
    '/users/:id/risk',
    {
      preHandler: [requirePerm('users.manage'), requireStepUp()],
      schema: {
        tags: ['users'],
        params: z.object({ id: z.string().uuid() }),
        body: z.object({
          tier: z.enum(['low', 'medium', 'high', 'frozen']),
          reason: z.string().min(5).max(500),
        }),
        response: {
          200: z.object({
            userId: z.string().uuid(),
            riskTier: z.enum(['low', 'medium', 'high', 'frozen']),
            riskReason: z.string(),
            riskUpdatedAt: z.string().datetime(),
            riskUpdatedBy: z.string().uuid(),
          }),
          400: ErrSchema,
          404: ErrSchema,
        },
      },
    },
    async (req, reply) => {
      // biome-ignore lint/style/noNonNullAssertion: requirePerm preHandler ensures session.staff exists
      const staffId = req.session.staff!.id;
      try {
        const result = await updateRiskTier(app.db, {
          userId: req.params.id,
          tier: req.body.tier,
          reason: req.body.reason,
          staffId,
        });
        return reply.code(200).send(result);
      } catch (err) {
        const msg = (err as Error).message;
        if (msg.includes('not found')) {
          return reply.code(404).send({ code: 'NOT_FOUND', message: msg });
        }
        return reply.code(400).send({ code: 'VALIDATION_ERROR', message: msg });
      }
    }
  );
};

export default usersRoutes;
