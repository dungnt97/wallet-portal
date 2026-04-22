// RBAC preHandler middleware — checks session staff role against permission matrix
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { PERMS, type Permission } from './permissions.js';

/**
 * Returns a Fastify preHandler that enforces a permission check.
 * Usage: { preHandler: requirePerm('withdrawals.approve') }
 */
export function requirePerm(perm: Permission): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const staff = request.session.staff;

    if (!staff) {
      return reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Login required' });
    }

    if (!PERMS[perm].includes(staff.role)) {
      return reply.code(403).send({
        code: 'FORBIDDEN',
        message: `Role '${staff.role}' lacks permission '${perm}'`,
      });
    }
  };
}

/**
 * Returns a preHandler that allows any authenticated staff (any role).
 * Use for routes that only require login, not a specific permission.
 */
export function requireAuth(): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.session.staff) {
      return reply.code(401).send({ code: 'UNAUTHENTICATED', message: 'Login required' });
    }
  };
}
