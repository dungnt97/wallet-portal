// Unit tests for Google OIDC hd-claim domain enforcement (D3)
import { describe, it, expect } from 'vitest';
import {
  isAllowedWorkspaceDomain,
} from '../auth/google-oidc-client.js';
import type { GoogleIdPayload } from '../auth/google-oidc-client.js';

function makePayload(overrides: Partial<Omit<GoogleIdPayload, 'hd' | 'picture'>> & { hd?: string | undefined; picture?: string | undefined } = {}): GoogleIdPayload {
  const base: GoogleIdPayload = {
    sub: 'google-sub-123',
    email: 'alice@company.com',
    email_verified: true,
    name: 'Alice',
    hd: 'company.com',
  };
  // Manually apply overrides to handle exactOptionalPropertyTypes
  const result: GoogleIdPayload = { ...base };
  if ('hd' in overrides) {
    if (overrides.hd !== undefined) {
      result.hd = overrides.hd;
    } else {
      delete result.hd;
    }
  }
  if ('picture' in overrides) {
    if (overrides.picture !== undefined) {
      result.picture = overrides.picture;
    } else {
      delete result.picture;
    }
  }
  return result;
}

describe('isAllowedWorkspaceDomain', () => {
  it('allows any domain when requiredDomain is empty string', () => {
    expect(isAllowedWorkspaceDomain(makePayload(), '')).toBe(true);
    expect(isAllowedWorkspaceDomain(makePayload({ hd: 'other.com' }), '')).toBe(true);
    expect(isAllowedWorkspaceDomain(makePayload({ hd: 'company.com' }), '')).toBe(true);
  });

  it('accepts matching hd claim', () => {
    const payload = makePayload({ hd: 'company.com' });
    expect(isAllowedWorkspaceDomain(payload, 'company.com')).toBe(true);
  });

  it('rejects mismatched hd claim', () => {
    const payload = makePayload({ hd: 'evil.com' });
    expect(isAllowedWorkspaceDomain(payload, 'company.com')).toBe(false);
  });

  it('rejects missing hd claim when domain is required', () => {
    // Create payload without hd property
    const payload = makePayload();
    delete payload.hd;
    expect(isAllowedWorkspaceDomain(payload, 'company.com')).toBe(false);
  });

  it('is case-sensitive — different casing is rejected', () => {
    const payload = makePayload({ hd: 'Company.com' });
    expect(isAllowedWorkspaceDomain(payload, 'company.com')).toBe(false);
  });

  it('allows no-hd payload when requiredDomain is empty', () => {
    const payload = makePayload();
    delete payload.hd;
    expect(isAllowedWorkspaceDomain(payload, '')).toBe(true);
  });
});
