// Global search route — GET /search?q=&limit=20
// Searches across: users.email, withdrawals.id+tx_hash, sweeps.tx_hash, deposits.tx_hash
// RBAC: treasurer role does NOT see user results (email PII); admin+operator+viewer sees all.
// Uses UNION ALL to resolve multiple entity types in one round-trip.
import { ilike, or, sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requirePerm } from '../auth/rbac.middleware.js';
import * as schema from '../db/schema/index.js';

/** A single search result item returned to the UI. */
const SearchResultItem = z.object({
  type: z.enum(['user', 'withdrawal', 'sweep', 'deposit']),
  id: z.string(),
  label: z.string(),
  subtitle: z.string(),
  href: z.string(),
});

export type SearchResultItemType = z.infer<typeof SearchResultItem>;

const MAX_RESULTS = 20;

const searchRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/search',
    {
      preHandler: requirePerm('search.read'),
      schema: {
        tags: ['search'],
        querystring: z.object({
          q: z.string().min(1).max(200),
          limit: z.coerce.number().int().positive().max(50).default(MAX_RESULTS),
        }),
        response: {
          200: z.object({ results: z.array(SearchResultItem) }),
        },
      },
    },
    async (req, reply) => {
      const { q, limit } = req.query;
      const role = req.session.staff?.role ?? 'viewer';
      const needle = q.trim();

      if (!needle) {
        return reply.code(200).send({ results: [] });
      }

      const results: SearchResultItemType[] = [];

      // ── User search — email prefix/contains (admin + operator + viewer only) ──
      // Treasurer role is excluded to avoid leaking end-user PII in the search surface.
      if (role !== 'treasurer') {
        const userRows = await app.db
          .select({ id: schema.users.id, email: schema.users.email, status: schema.users.status })
          .from(schema.users)
          .where(ilike(schema.users.email, `%${needle}%`))
          .limit(limit);

        for (const u of userRows) {
          results.push({
            type: 'user',
            id: u.id,
            label: u.email,
            subtitle: `User · ${u.status}`,
            href: `/users/${u.id}`,
          });
        }
      }

      // ── Withdrawal search — UUID prefix OR tx_hash prefix ────────────────────
      const withdrawalRows = await app.db
        .select({
          id: schema.withdrawals.id,
          chain: schema.withdrawals.chain,
          token: schema.withdrawals.token,
          amount: schema.withdrawals.amount,
          status: schema.withdrawals.status,
          txHash: schema.withdrawals.txHash,
        })
        .from(schema.withdrawals)
        .where(
          or(
            ilike(sql`${schema.withdrawals.id}::text`, `${needle}%`),
            ilike(schema.withdrawals.txHash, `${needle}%`)
          )
        )
        .limit(limit);

      for (const w of withdrawalRows) {
        results.push({
          type: 'withdrawal',
          id: w.id,
          label: `${w.amount} ${w.token} on ${w.chain}`,
          subtitle: `Withdrawal · ${w.status}${w.txHash ? ` · ${w.txHash.slice(0, 12)}…` : ''}`,
          href: `/withdrawals/${w.id}`,
        });
      }

      // ── Sweep search — tx_hash prefix ────────────────────────────────────────
      const sweepRows = await app.db
        .select({
          id: schema.sweeps.id,
          chain: schema.sweeps.chain,
          status: schema.sweeps.status,
          txHash: schema.sweeps.txHash,
          amount: schema.sweeps.amount,
          token: schema.sweeps.token,
        })
        .from(schema.sweeps)
        .where(
          or(
            ilike(sql`${schema.sweeps.id}::text`, `${needle}%`),
            ilike(schema.sweeps.txHash, `${needle}%`)
          )
        )
        .limit(limit);

      for (const s of sweepRows) {
        results.push({
          type: 'sweep',
          id: s.id,
          label: `${s.amount} ${s.token} on ${s.chain}`,
          subtitle: `Sweep · ${s.status}${s.txHash ? ` · ${s.txHash.slice(0, 12)}…` : ''}`,
          href: '/sweep',
        });
      }

      // ── Deposit search — tx_hash prefix ──────────────────────────────────────
      const depositRows = await app.db
        .select({
          id: schema.deposits.id,
          chain: schema.deposits.chain,
          status: schema.deposits.status,
          txHash: schema.deposits.txHash,
          amount: schema.deposits.amount,
          token: schema.deposits.token,
        })
        .from(schema.deposits)
        .where(
          or(
            ilike(sql`${schema.deposits.id}::text`, `${needle}%`),
            ilike(schema.deposits.txHash, `${needle}%`)
          )
        )
        .limit(limit);

      for (const d of depositRows) {
        results.push({
          type: 'deposit',
          id: d.id,
          label: `${d.amount} ${d.token} on ${d.chain}`,
          subtitle: `Deposit · ${d.status}${d.txHash ? ` · ${d.txHash.slice(0, 12)}…` : ''}`,
          href: `/deposits/${d.id}`,
        });
      }

      // Trim to overall limit after combining all entity results
      return reply.code(200).send({ results: results.slice(0, limit) });
    }
  );
};

export default searchRoutes;
