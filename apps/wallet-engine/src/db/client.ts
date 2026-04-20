// Drizzle DB client — reuses admin-api schema via @wp/admin-api/db-schema export (D1)
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@wp/admin-api/db-schema';

export const makeDb = (url: string) => {
  const client = postgres(url);
  return drizzle(client, { schema });
};

export type Db = ReturnType<typeof makeDb>;
