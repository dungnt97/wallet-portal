/**
 * sync-deployed-envs.ts
 *
 * Reads .deployed.json and merges/overwrites the relevant keys into each
 * app's .env.local file, preserving unrelated keys.
 *
 * Idempotent — running twice with unchanged .deployed.json produces no diff.
 *
 * Usage:
 *   pnpm --filter @wp/chain-scripts sync-envs
 *
 * Extensible via KEY_MAPPINGS table — Phase 05 appends Safe entries there.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── paths ─────────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Absolute path to infra/chain/ */
const CHAIN_DIR = resolve(__dirname, '..');

/** Absolute path to repo root (infra/chain/../../ = project root) */
const REPO_ROOT = resolve(CHAIN_DIR, '../..');

// ── key mapping table ─────────────────────────────────────────────────────────

/**
 * Each entry maps one key in .deployed.json to per-app env keys.
 * To extend (e.g. Phase 05 Safe EVM): append a new entry.
 */
interface KeyMapping {
  /** Key in .deployed.json */
  deployedKey: string;
  /** Map of app name -> env var name written into that app's .env.local */
  targets: Record<string, string>;
}

const KEY_MAPPINGS: KeyMapping[] = [
  {
    deployedKey: 'SQUADS_MULTISIG_PDA_DEVNET',
    targets: {
      ui: 'VITE_SQUADS_MULTISIG_PDA_DEVNET',
      'admin-api': 'SQUADS_MULTISIG_PDA_DEVNET',
      'wallet-engine': 'SQUADS_MULTISIG_PDA_DEVNET',
    },
  },
  {
    deployedKey: 'SQUADS_VAULT_PDA_DEVNET',
    targets: {
      ui: 'VITE_SQUADS_VAULT_PDA_DEVNET',
      'admin-api': 'SQUADS_VAULT_PDA_DEVNET',
      'wallet-engine': 'SQUADS_VAULT_PDA_DEVNET',
    },
  },
  // Phase 05: Safe EVM multisig on BNB Chapel testnet
  {
    deployedKey: 'SAFE_ADDRESS_BNB_TESTNET',
    targets: {
      ui: 'VITE_SAFE_ADDRESS_BNB_TESTNET',
      'admin-api': 'SAFE_ADDRESS_BNB_TESTNET',
      'wallet-engine': 'SAFE_ADDRESS_BNB_TESTNET',
    },
  },
  // Phase 05: Self-hosted Safe Transaction Service URL
  {
    deployedKey: 'SAFE_TX_SERVICE_URL',
    targets: {
      ui: 'VITE_SAFE_TX_SERVICE_URL',
      'admin-api': 'SAFE_TX_SERVICE_URL',
      'wallet-engine': 'SAFE_TX_SERVICE_URL',
    },
  },
];

/** All app directory names referenced by KEY_MAPPINGS */
const ALL_APPS = [...new Set(KEY_MAPPINGS.flatMap((m) => Object.keys(m.targets)))];

// ── env file helpers ──────────────────────────────────────────────────────────

/**
 * Parses a .env file into an ordered array of raw lines (comments + blank lines
 * preserved) plus a lookup map of key -> line-index for O(1) updates.
 */
function parseEnvLines(content: string): {
  lines: string[];
  keyIndex: Map<string, number>;
} {
  const lines = content.split('\n');
  // Remove trailing empty element from trailing newline
  if (lines.at(-1) === '') lines.pop();
  const keyIndex = new Map<string, number>();
  for (const [i, line] of lines.entries()) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line);
    if (match?.[1]) keyIndex.set(match[1], i);
  }
  return { lines, keyIndex };
}

/**
 * Merges updates into an existing .env.local content string.
 * Keys already present are overwritten in-place; new keys are appended.
 * Returns the updated content string (trailing newline ensured).
 */
function mergeEnvContent(existing: string, updates: Record<string, string>): string {
  const { lines, keyIndex } = parseEnvLines(existing);
  for (const [key, value] of Object.entries(updates)) {
    const entry = `${key}=${value}`;
    const idx = keyIndex.get(key);
    if (idx !== undefined) {
      lines[idx] = entry;
    } else {
      lines.push(entry);
      keyIndex.set(key, lines.length - 1);
    }
  }
  return lines.join('\n') + '\n';
}

/**
 * Reads .env.local for the given app path, merges updates, writes back.
 * Creates the file (and parent directory) if it does not exist.
 * Returns true if the file was changed, false if already up-to-date.
 */
function syncAppEnvLocal(appDir: string, updates: Record<string, string>): boolean {
  const envPath = resolve(appDir, '.env.local');
  const existing = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  const merged = mergeEnvContent(existing, updates);

  // Strict idempotency: compare merged result against current content
  const normalised = existing.endsWith('\n') || existing === '' ? existing : existing + '\n';
  if (merged === normalised && existing !== '') {
    // Verify all target keys are already present with correct values
    const { keyIndex, lines } = parseEnvLines(merged);
    const anyDiff = Object.entries(updates).some(([k, v]) => {
      const idx = keyIndex.get(k);
      return idx === undefined || lines[idx] !== `${k}=${v}`;
    });
    if (!anyDiff) return false;
  }

  mkdirSync(dirname(envPath), { recursive: true });
  writeFileSync(envPath, merged, 'utf8');
  return true;
}

// ── main ──────────────────────────────────────────────────────────────────────

const deployedPath = resolve(CHAIN_DIR, '.deployed.json');
if (!existsSync(deployedPath)) {
  console.error('ERROR: .deployed.json not found at', deployedPath);
  console.error('  Run `pnpm deploy:squads-devnet` first to generate it.');
  process.exit(1);
}

const deployed = JSON.parse(readFileSync(deployedPath, 'utf8')) as Record<string, string>;

console.log('=== sync-envs: propagating .deployed.json to app .env.local files ===');

let anyChanged = false;

for (const app of ALL_APPS) {
  const appDir = resolve(REPO_ROOT, 'apps', app);
  const updates: Record<string, string> = {};

  for (const mapping of KEY_MAPPINGS) {
    const value = deployed[mapping.deployedKey];
    if (value === undefined || value === null) continue;
    const envKey = mapping.targets[app];
    if (!envKey) continue;
    updates[envKey] = value;
  }

  if (Object.keys(updates).length === 0) continue;

  const changed = syncAppEnvLocal(appDir, updates);
  const label = changed ? 'updated' : 'unchanged';
  console.log(`  apps/${app}/.env.local  [${label}]`);
  for (const [k, v] of Object.entries(updates)) {
    console.log(`    ${k}=${v}`);
  }
  if (changed) anyChanged = true;
}

if (!anyChanged) {
  console.log('\nAll env files already up-to-date. Nothing changed.');
} else {
  console.log('\nDone. Run your apps to pick up the updated env vars.');
  console.log('NOTE: .env.local files are git-ignored — no secrets committed.');
}
