// DEV ONLY — drops all tables and re-runs migrations + seed
// Never run against a production or staging database.
import 'dotenv/config';
import postgres from 'postgres';

const url = process.env['DATABASE_URL'];
if (!url) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

if (process.env['NODE_ENV'] === 'production') {
  console.error('ERROR: db:reset is not allowed in production');
  process.exit(1);
}

const client = postgres(url, { max: 1 });

console.log('Dropping schema public (cascade)…');
await client`DROP SCHEMA public CASCADE`;
await client`CREATE SCHEMA public`;
console.log('Schema reset. Run db:migrate then db:seed to restore.');

await client.end();
