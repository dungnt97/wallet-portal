/**
 * sync-deployed-envs.test.ts
 *
 * Unit tests for the env sync helper.
 * All file I/O is done inside a tmp directory — no real repo env files are touched.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

// ── helpers (extracted from sync-deployed-envs.ts for testability) ─────────────

function parseEnvLines(content: string): {
  lines: string[];
  keyIndex: Map<string, number>;
} {
  const lines = content.split('\n');
  if (lines.at(-1) === '') lines.pop();
  const keyIndex = new Map<string, number>();
  for (const [i, line] of lines.entries()) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line);
    if (match?.[1]) keyIndex.set(match[1], i);
  }
  return { lines, keyIndex };
}

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

function syncAppEnvLocal(envPath: string, updates: Record<string, string>): boolean {
  const existing = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  const merged = mergeEnvContent(existing, updates);

  const normalised = existing.endsWith('\n') || existing === '' ? existing : existing + '\n';
  if (merged === normalised && existing !== '') {
    const { keyIndex, lines } = parseEnvLines(merged);
    const anyDiff = Object.entries(updates).some(([k, v]) => {
      const idx = keyIndex.get(k);
      return idx === undefined || lines[idx] !== `${k}=${v}`;
    });
    if (!anyDiff) return false;
  }

  writeFileSync(envPath, merged, 'utf8');
  return true;
}

// ── fixtures ──────────────────────────────────────────────────────────────────

const SQUADS_MULTISIG = 'AMultisigPDA1111111111111111111111111111111';
const SQUADS_VAULT = 'AVaultPDA111111111111111111111111111111111';

const DEPLOYED_JSON = JSON.stringify({
  SQUADS_MULTISIG_PDA_DEVNET: SQUADS_MULTISIG,
  SQUADS_VAULT_PDA_DEVNET: SQUADS_VAULT,
  _updatedAt: '2026-04-22T00:00:00.000Z',
});

// ── test suite ─────────────────────────────────────────────────────────────────

describe('mergeEnvContent', () => {
  it('appends new keys to empty content', () => {
    const result = mergeEnvContent('', { FOO: 'bar' });
    expect(result).toBe('FOO=bar\n');
  });

  it('appends new keys to existing content', () => {
    const result = mergeEnvContent('EXISTING=value\n', { FOO: 'bar' });
    expect(result).toBe('EXISTING=value\nFOO=bar\n');
  });

  it('overwrites existing key in-place', () => {
    const result = mergeEnvContent('FOO=old\nOTHER=keep\n', { FOO: 'new' });
    expect(result).toBe('FOO=new\nOTHER=keep\n');
  });

  it('preserves comments and blank lines', () => {
    const existing = '# comment\n\nFOO=old\n';
    const result = mergeEnvContent(existing, { FOO: 'new' });
    expect(result).toBe('# comment\n\nFOO=new\n');
  });

  it('preserves unrelated keys when adding new keys', () => {
    const existing = 'UNRELATED=keep\nANOTHER=also_keep\n';
    const result = mergeEnvContent(existing, { NEW_KEY: 'value' });
    expect(result).toContain('UNRELATED=keep');
    expect(result).toContain('ANOTHER=also_keep');
    expect(result).toContain('NEW_KEY=value');
  });
});

describe('syncAppEnvLocal', () => {
  let tmpDir: string;
  let envPath: string;

  beforeEach(() => {
    tmpDir = resolve(tmpdir(), `sync-envs-test-${randomUUID()}`);
    mkdirSync(tmpDir, { recursive: true });
    envPath = resolve(tmpDir, '.env.local');
  });

  it('creates .env.local if it does not exist', () => {
    const changed = syncAppEnvLocal(envPath, { FOO: 'bar' });
    expect(changed).toBe(true);
    expect(existsSync(envPath)).toBe(true);
    expect(readFileSync(envPath, 'utf8')).toBe('FOO=bar\n');
  });

  it('writes Squads keys to a fresh .env.local', () => {
    const changed = syncAppEnvLocal(envPath, {
      VITE_SQUADS_MULTISIG_PDA_DEVNET: SQUADS_MULTISIG,
      VITE_SQUADS_VAULT_PDA_DEVNET: SQUADS_VAULT,
    });
    expect(changed).toBe(true);
    const content = readFileSync(envPath, 'utf8');
    expect(content).toContain(`VITE_SQUADS_MULTISIG_PDA_DEVNET=${SQUADS_MULTISIG}`);
    expect(content).toContain(`VITE_SQUADS_VAULT_PDA_DEVNET=${SQUADS_VAULT}`);
  });

  it('preserves unrelated keys in existing .env.local', () => {
    writeFileSync(envPath, 'VITE_API_URL=http://localhost:3000\nVITE_AUTH_DEV_MODE=true\n');
    syncAppEnvLocal(envPath, {
      VITE_SQUADS_MULTISIG_PDA_DEVNET: SQUADS_MULTISIG,
    });
    const content = readFileSync(envPath, 'utf8');
    expect(content).toContain('VITE_API_URL=http://localhost:3000');
    expect(content).toContain('VITE_AUTH_DEV_MODE=true');
    expect(content).toContain(`VITE_SQUADS_MULTISIG_PDA_DEVNET=${SQUADS_MULTISIG}`);
  });

  it('is idempotent — second run returns changed=false', () => {
    const updates = {
      VITE_SQUADS_MULTISIG_PDA_DEVNET: SQUADS_MULTISIG,
      VITE_SQUADS_VAULT_PDA_DEVNET: SQUADS_VAULT,
    };
    const first = syncAppEnvLocal(envPath, updates);
    const second = syncAppEnvLocal(envPath, updates);
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it('is idempotent — file content identical after two runs', () => {
    const updates = { SQUADS_MULTISIG_PDA_DEVNET: SQUADS_MULTISIG };
    syncAppEnvLocal(envPath, updates);
    const after1 = readFileSync(envPath, 'utf8');
    syncAppEnvLocal(envPath, updates);
    const after2 = readFileSync(envPath, 'utf8');
    expect(after1).toBe(after2);
  });

  it('overwrites a stale key value on re-run', () => {
    writeFileSync(envPath, `SQUADS_MULTISIG_PDA_DEVNET=OldValue\nOTHER=keep\n`);
    const changed = syncAppEnvLocal(envPath, { SQUADS_MULTISIG_PDA_DEVNET: SQUADS_MULTISIG });
    expect(changed).toBe(true);
    const content = readFileSync(envPath, 'utf8');
    expect(content).toContain(`SQUADS_MULTISIG_PDA_DEVNET=${SQUADS_MULTISIG}`);
    expect(content).not.toContain('OldValue');
    expect(content).toContain('OTHER=keep');
  });
});

describe('deployed.json fixture integration', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = resolve(tmpdir(), `sync-envs-integration-${randomUUID()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  it('propagates all three apps from a .deployed.json fixture', () => {
    const deployed = JSON.parse(DEPLOYED_JSON) as Record<string, string>;

    // KEY_MAPPINGS logic inlined for test isolation
    const keyMappings = [
      {
        deployedKey: 'SQUADS_MULTISIG_PDA_DEVNET',
        targets: {
          ui: 'VITE_SQUADS_MULTISIG_PDA_DEVNET',
          'admin-api': 'SQUADS_MULTISIG_PDA_DEVNET',
          'wallet-engine': 'SQUADS_MULTISIG_PDA_DEVNET',
        } as Record<string, string>,
      },
      {
        deployedKey: 'SQUADS_VAULT_PDA_DEVNET',
        targets: {
          ui: 'VITE_SQUADS_VAULT_PDA_DEVNET',
          'admin-api': 'SQUADS_VAULT_PDA_DEVNET',
          'wallet-engine': 'SQUADS_VAULT_PDA_DEVNET',
        } as Record<string, string>,
      },
    ];
    const apps = ['ui', 'admin-api', 'wallet-engine'];

    for (const app of apps) {
      const appDir = resolve(tmpDir, 'apps', app);
      mkdirSync(appDir, { recursive: true });
      // Pre-populate with unrelated keys to verify preservation
      writeFileSync(resolve(appDir, '.env.local'), `EXISTING_KEY=keep_me\n`);

      const updates: Record<string, string> = {};
      for (const mapping of keyMappings) {
        const value = deployed[mapping.deployedKey];
        if (!value) continue;
        const envKey = mapping.targets[app];
        if (envKey) updates[envKey] = value;
      }
      syncAppEnvLocal(resolve(appDir, '.env.local'), updates);
    }

    // Verify UI gets VITE_ prefix
    const uiContent = readFileSync(resolve(tmpDir, 'apps/ui/.env.local'), 'utf8');
    expect(uiContent).toContain(`VITE_SQUADS_MULTISIG_PDA_DEVNET=${SQUADS_MULTISIG}`);
    expect(uiContent).toContain(`VITE_SQUADS_VAULT_PDA_DEVNET=${SQUADS_VAULT}`);
    // UI must NOT have the bare (non-VITE) key — check no line starts with bare name
    expect(uiContent).not.toMatch(/^SQUADS_MULTISIG_PDA_DEVNET=/m);
    expect(uiContent).toContain('EXISTING_KEY=keep_me');

    // Verify backends get bare names
    for (const app of ['admin-api', 'wallet-engine']) {
      const content = readFileSync(resolve(tmpDir, `apps/${app}/.env.local`), 'utf8');
      expect(content).toContain(`SQUADS_MULTISIG_PDA_DEVNET=${SQUADS_MULTISIG}`);
      expect(content).toContain(`SQUADS_VAULT_PDA_DEVNET=${SQUADS_VAULT}`);
      expect(content).not.toContain('VITE_');
      expect(content).toContain('EXISTING_KEY=keep_me');
    }
  });
});
