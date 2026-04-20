// Fastify instance augmentation — adds app.db, app.redis, app.io decorators
import type { Db } from '../db/index.js';
import type { Redis } from 'ioredis';
import type { Server as SocketIOServer } from 'socket.io';
import type { Queue } from 'bullmq';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
    redis: Redis;
    io: SocketIOServer;
    queue: Queue;
  }

  interface Session {
    staff?: {
      id: string;
      email: string;
      name: string;
      role: 'admin' | 'treasurer' | 'operator' | 'viewer';
    };
  }
}
