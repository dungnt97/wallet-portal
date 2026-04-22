// Generic RPC pool abstraction — retry with exponential backoff + failover
import pino from 'pino';

const logger = pino({ name: 'rpc-pool' });

export interface PoolOptions {
  /** Max attempts per call before throwing */
  maxAttempts?: number;
  /** Base delay in ms for exponential backoff */
  baseDelayMs?: number;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 200;

/** Sleep helper */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retry a thunk with exponential backoff.
 * Throws the last error if all attempts exhaust.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: PoolOptions = {}): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelay = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        const delay = baseDelay * 2 ** (attempt - 1);
        logger.warn({ attempt, delay, err }, 'RPC call failed — retrying');
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/**
 * Try providers in order; return first success.
 * Combines failover with per-provider retry.
 */
export async function withFailover<TProvider, TResult>(
  providers: TProvider[],
  fn: (provider: TProvider) => Promise<TResult>,
  opts: PoolOptions = {}
): Promise<TResult> {
  let lastError: unknown;

  for (const provider of providers) {
    try {
      return await withRetry(() => fn(provider), opts);
    } catch (err) {
      lastError = err;
      logger.warn({ err }, 'Provider failed — trying next');
    }
  }

  throw lastError ?? new Error('All RPC providers failed');
}
