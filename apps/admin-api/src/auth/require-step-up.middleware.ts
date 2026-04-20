// requireStepUp — preHandler middleware enforcing WebAuthn step-up within 5-min TTL
// Attach to any write-method route that mutates sensitive data (deposits, withdrawals, users, staff).
// /internal/* routes are EXEMPT — they use bearer token auth (D4).
import type { FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify';

const STEP_UP_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Rejects the request with 403 STEP_UP_REQUIRED unless:
 *   - session.steppedUpAt is set, AND
 *   - it occurred within the last 5 minutes
 *
 * Usage: { preHandler: [requireAuth(), requireStepUp()] }
 */
export function requireStepUp(): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.session.staff) {
      return reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Login required' });
    }

    const steppedUpAt = request.session.steppedUpAt;
    if (!steppedUpAt) {
      return reply.code(403).send({ code: 'STEP_UP_REQUIRED', message: 'WebAuthn step-up required' });
    }

    const elapsed = Date.now() - new Date(steppedUpAt).getTime();
    if (elapsed > STEP_UP_TTL_MS) {
      return reply.code(403).send({ code: 'STEP_UP_REQUIRED', message: 'Step-up session expired — re-verify with security key' });
    }
  };
}
