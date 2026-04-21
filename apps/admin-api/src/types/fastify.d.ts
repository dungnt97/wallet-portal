import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Server as SocketIOServer } from 'socket.io';
// Fastify instance augmentation — adds app.db, app.redis, app.io decorators
import type { Db } from '../db/index.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    redis: Redis;
    io: SocketIOServer;
    queue: Queue;
    sweepQueue: Queue;
  }

  interface Session {
    /** Authenticated staff member — set on OIDC callback */
    staff?: {
      id: string;
      email: string;
      name: string;
      role: 'admin' | 'treasurer' | 'operator' | 'viewer';
    };
    /** Step-up expiry timestamp (ISO string) — set after WebAuthn assertion */
    steppedUpAt?: string;
    /** Pending OAuth state/verifier for CSRF validation */
    oauthState?: {
      state: string;
      verifier: string;
    };
    /** Pending WebAuthn challenge for registration or authentication */
    webauthnChallenge?: string;
    /** When webauthnChallenge expires (epoch ms) */
    webauthnChallengeExpiresAt?: number;
  }
}
