// ioredis connection factory for BullMQ — single instance per process
import IORedis from 'ioredis';
import pino from 'pino';

const logger = pino({ name: 'redis-connection' });

let instance: IORedis | null = null;

/** Get or create the singleton ioredis connection */
export function getRedisConnection(url: string): IORedis {
  if (instance) return instance;

  instance = new IORedis(url, {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
  });

  instance.on('connect', () => logger.info('Redis connected'));
  instance.on('error', (err) => logger.error({ err }, 'Redis error'));
  instance.on('close', () => logger.warn('Redis connection closed'));

  return instance;
}

/** Close the Redis connection gracefully */
export async function closeRedisConnection(): Promise<void> {
  if (!instance) return;
  await instance.quit();
  instance = null;
  logger.info('Redis connection closed');
}
