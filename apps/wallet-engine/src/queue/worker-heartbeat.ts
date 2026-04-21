// worker-heartbeat — DRY heartbeat writer for all BullMQ workers.
// Each worker calls startHeartbeat() on init; it writes a Redis key every 10s.
// The ops health endpoint reads these keys to detect stale workers.
//
// Key:    worker:<name>:heartbeat
// Value:  epoch ms (Date.now()) as string
// Expiry: 60s — if the worker dies the key auto-expires
import type IORedis from 'ioredis';
import pino from 'pino';

const HEARTBEAT_INTERVAL_MS = 10_000;
const HEARTBEAT_EXPIRY_SEC = 60;

const logger = pino({ name: 'worker-heartbeat' });

/**
 * Write an immediate heartbeat then schedule repeated writes every 10s.
 * Returns a cleanup function that clears the interval on worker shutdown.
 */
export function startHeartbeat(redis: IORedis, workerName: string): () => void {
  const key = `worker:${workerName}:heartbeat`;

  const write = () => {
    redis
      .set(key, String(Date.now()), 'EX', HEARTBEAT_EXPIRY_SEC)
      .catch((err: unknown) => logger.warn({ err, workerName }, 'heartbeat write failed'));
  };

  // Write immediately on startup
  write();

  const timer = setInterval(write, HEARTBEAT_INTERVAL_MS);

  return () => {
    clearInterval(timer);
  };
}
