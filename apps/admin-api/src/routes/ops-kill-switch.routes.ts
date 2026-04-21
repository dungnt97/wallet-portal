// Ops kill-switch routes — GET + POST /ops/kill-switch
// GET  — returns current flag state (any authenticated staff)
// POST — toggles the flag; requires WebAuthn step-up + ops.killswitch.toggle permission
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { requireAuth } from '../auth/rbac.middleware.js';
import { requirePerm } from '../auth/rbac.middleware.js';
import { requireStepUp } from '../auth/require-step-up.middleware.js';
import { KillSwitchEnabledError, getState, toggle } from '../services/kill-switch.service.js';
import { notifyStaff } from '../services/notify-staff.service.js';

const KillSwitchStateSchema = z.object({
  enabled: z.boolean(),
  reason: z.string().nullable(),
  updatedByStaffId: z.string().uuid().nullable(),
  updatedAt: z.string().datetime(),
});

const opsKillSwitchRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  // ── GET /ops/kill-switch ───────────────────────────────────────────────────
  r.get(
    '/ops/kill-switch',
    {
      preHandler: requireAuth(),
      schema: {
        tags: ['ops'],
        response: { 200: KillSwitchStateSchema },
      },
    },
    async (_req, reply) => {
      const state = await getState(app.db);
      return reply.code(200).send(state);
    }
  );

  // ── POST /ops/kill-switch ──────────────────────────────────────────────────
  r.post(
    '/ops/kill-switch',
    {
      preHandler: [requirePerm('ops.killswitch.toggle'), requireStepUp()],
      schema: {
        tags: ['ops'],
        body: z.object({
          enabled: z.boolean(),
          reason: z.string().max(500).optional(),
        }),
        response: {
          200: KillSwitchStateSchema,
          403: z.object({ code: z.string(), message: z.string() }),
          423: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const staffId = (req.session.staff ?? { id: '' }).id;
      try {
        const state = await toggle(
          app.db,
          { enabled: req.body.enabled, reason: req.body.reason ?? undefined, staffId },
          app.io
        );
        // Notify ops + admins of kill-switch state change — always critical (fire-and-forget)
        const eventType = req.body.enabled ? 'ops.killswitch.enabled' : 'ops.killswitch.disabled';
        const notifyRoles = ['admin', 'ops'] as const;
        const ksTitle = req.body.enabled
          ? 'Kill-switch ENABLED — outbound paused'
          : 'Kill-switch disabled — outbound resumed';
        const ksPayload = { enabled: state.enabled, updatedByStaffId: staffId };
        for (const role of notifyRoles) {
          notifyStaff(
            app.db,
            app.io,
            {
              role,
              eventType,
              severity: 'critical',
              title: ksTitle,
              ...(state.reason != null && { body: state.reason }),
              payload: ksPayload,
            },
            app.emailQueue,
            app.slackQueue
          ).catch((err) => app.log.error({ err }, 'notifyStaff failed'));
        }
        return reply.code(200).send(state);
      } catch (err) {
        if (err instanceof KillSwitchEnabledError) {
          return reply.code(423).send({ code: err.code, message: err.message });
        }
        throw err;
      }
    }
  );
};

export default opsKillSwitchRoutes;
