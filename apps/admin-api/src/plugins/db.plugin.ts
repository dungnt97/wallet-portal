import type { FastifyPluginAsync } from 'fastify';
// Drizzle DB plugin — decorates app.db with a typed Drizzle instance
import fp from 'fastify-plugin';
import type { Config } from '../config/env.js';
import { makeDb } from '../db/index.js';

const dbPlugin: FastifyPluginAsync<Pick<Config, 'DATABASE_URL'>> = async (app, opts) => {
  const db = makeDb(opts.DATABASE_URL);
  app.decorate('db', db);

  // Graceful close: postgres.js client exposes .end()
  app.addHook('onClose', async () => {
    // drizzle wraps postgres-js; .$client exposes the underlying postgres.js sql instance
    const client = (db as unknown as { $client: { end: () => Promise<void> } }).$client;
    await client.end();
  });
};

export default fp(dbPlugin, { name: 'db' });
