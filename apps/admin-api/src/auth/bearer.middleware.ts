// Bearer token middleware for /internal/* routes (Decision D4)
// Uses constant-time comparison to prevent timing attacks on the shared secret.
import type { FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify';
import { timingSafeEqual } from 'node:crypto';

/**
 * Returns a preHandler that enforces Bearer token authentication.
 * Token is compared in constant time to prevent timing side-channels.
 * Used on all /internal/* routes per Decision D4 (SVC_BEARER_TOKEN).
 */
export function requireBearer(expectedToken: string): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({
        code: 'MISSING_BEARER',
        message: 'Authorization: Bearer <token> header required',
      });
    }

    const provided = authHeader.slice(7); // strip "Bearer "

    // Constant-time compare — both buffers must be same byte length
    // Pad shorter to prevent length-based leakage
    const a = Buffer.from(provided.padEnd(64));
    const b = Buffer.from(expectedToken.padEnd(64));

    const valid =
      provided.length === expectedToken.length &&
      timingSafeEqual(a.subarray(0, 64), b.subarray(0, 64));

    if (!valid) {
      return reply.code(401).send({
        code: 'INVALID_BEARER',
        message: 'Invalid or expired bearer token',
      });
    }
  };
}
