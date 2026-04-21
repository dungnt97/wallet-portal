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
    /** BullMQ queue for cold-timelock delayed broadcast jobs (Slice 7) */
    coldTimelockQueue: Queue;
    /** BullMQ queue for immediate email notifications (Slice 5) */
    emailQueue: Queue;
    /** BullMQ queue for Slack webhook notifications (Slice 5) */
    slackQueue: Queue;
    /** BullMQ queue for signer ceremony broadcast jobs (Slice 6) */
    ceremonyQueue: Queue;
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
