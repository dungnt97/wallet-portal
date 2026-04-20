// Drizzle client factory — consumed by admin-api server and scripts
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

/**
 * Create a Drizzle DB instance bound to the given DATABASE_URL.
 * Each call creates a new connection pool — call once per process.
 */
export const makeDb = (url: string) => {
  const client = postgres(url);
  return drizzle(client, { schema });
};

export type Db = ReturnType<typeof makeDb>;

/** Convenience singleton for scripts — reads DATABASE_URL from environment */
const getEnvDatabaseUrl = (): string => {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL environment variable is required');
  return url;
};

export const createDbFromEnv = (): Db => makeDb(getEnvDatabaseUrl());
