// Generates TypeScript types from admin-api OpenAPI spec.
// Usage: pnpm --filter @wp/ui gen:api-types
// Requires admin-api running on :3001.
//
// Uses execFile (not exec) — no shell injection risk since all args are
// hardcoded constants, not user input. execSync with shell:false equivalent.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '../src/api');
const outFile = join(outDir, 'types.gen.ts');
const apiUrl = process.env['ADMIN_API_URL'] ?? 'http://localhost:3001';
const specUrl = `${apiUrl}/openapi.json`;

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

console.log(`Generating API types from ${specUrl} ...`);
console.log(`Output: ${outFile}\n`);

try {
  // execFileSync avoids shell — args are static literals, no injection risk
  execFileSync(
    'pnpm',
    ['dlx', 'openapi-typescript', specUrl, '-o', outFile],
    { stdio: 'inherit' },
  );
  console.log('\nDone. Commit src/api/types.gen.ts when schema stabilises.');
} catch {
  console.error('\nFailed to generate types. Is admin-api running on :3001?');
  console.error('Start it: DATABASE_URL=postgres://postgres:postgres@localhost:5433/postgres pnpm --filter @wp/admin-api dev');
  process.exit(1);
}
