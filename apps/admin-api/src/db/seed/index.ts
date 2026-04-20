// Master seed runner — run via `pnpm --filter @wp/admin-api db:seed`
import 'dotenv/config';
import { createDbFromEnv } from '../index.js';
import { seedStaff } from './staff-seed.js';
import { seedUsers } from './users-seed.js';
import { seedWallets } from './wallets-seed.js';

async function main(): Promise<void> {
  const db = createDbFromEnv();

  console.log('Running seed fixtures…');

  // Order matters: staff first (users + wallets have no FK to staff)
  await seedStaff(db);
  await seedUsers(db);
  await seedWallets(db);

  console.log('Seed complete.');
  process.exit(0);
}

main().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
