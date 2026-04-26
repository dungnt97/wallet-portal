import { beforeEach, describe, expect, it, vi } from 'vitest';
// Tests for auth utilities:
//   session-lookup.ts        — lookupStaffByEmail
//   google-oidc-client.ts    — buildAuthUrl, buildAuthUrlWithDomain, isAllowedWorkspaceDomain,
//                               verifyIdToken (partial), exchangeCodeForIdToken error paths

// ── session-lookup ────────────────────────────────────────────────────────────

describe('lookupStaffByEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns staff when active record found', async () => {
    const staffRow = {
      id: 'staff-001',
      email: 'admin@example.com',
      name: 'Admin User',
      role: 'admin',
      status: 'active',
    };
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([staffRow]),
          }),
        }),
      }),
    } as never;

    const { lookupStaffByEmail } = await import('../auth/session-lookup.js');
    const result = await lookupStaffByEmail(db, 'admin@example.com');
    expect(result).toEqual({
      id: 'staff-001',
      email: 'admin@example.com',
      name: 'Admin User',
      role: 'admin',
    });
  });

  it('returns null when staff is not active', async () => {
    const staffRow = {
      id: 'staff-002',
      email: 'suspended@example.com',
      name: 'Suspended',
      role: 'operator',
      status: 'suspended',
    };
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([staffRow]),
          }),
        }),
      }),
    } as never;

    const { lookupStaffByEmail } = await import('../auth/session-lookup.js');
    const result = await lookupStaffByEmail(db, 'suspended@example.com');
    expect(result).toBeNull();
  });

  it('returns null when no staff record found', async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    } as never;

    const { lookupStaffByEmail } = await import('../auth/session-lookup.js');
    const result = await lookupStaffByEmail(db, 'unknown@example.com');
    expect(result).toBeNull();
  });

  it('returns staff with offboarded status as null', async () => {
    const staffRow = {
      id: 'staff-003',
      email: 'left@example.com',
      name: 'Ex Employee',
      role: 'treasurer',
      status: 'offboarded',
    };
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([staffRow]),
          }),
        }),
      }),
    } as never;

    const { lookupStaffByEmail } = await import('../auth/session-lookup.js');
    const result = await lookupStaffByEmail(db, 'left@example.com');
    expect(result).toBeNull();
  });
});

// ── google-oidc-client: buildAuthUrl ─────────────────────────────────────────

describe('buildAuthUrl', () => {
  it('builds correct Google OAuth2 authorization URL', async () => {
    const { buildAuthUrl } = await import('../auth/google-oidc-client.js');
    const cfg = {
      clientId: 'client-id-123',
      clientSecret: 'secret',
      redirectUri: 'https://app.example.com/auth/callback',
    };
    const url = buildAuthUrl(cfg, 'state-abc', 'challenge-xyz');
    const parsed = new URL(url);

    expect(parsed.hostname).toBe('accounts.google.com');
    expect(parsed.searchParams.get('client_id')).toBe('client-id-123');
    expect(parsed.searchParams.get('redirect_uri')).toBe('https://app.example.com/auth/callback');
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('scope')).toBe('openid email profile');
    expect(parsed.searchParams.get('state')).toBe('state-abc');
    expect(parsed.searchParams.get('code_challenge')).toBe('challenge-xyz');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
    expect(parsed.searchParams.get('access_type')).toBe('online');
  });
});

describe('buildAuthUrlWithDomain', () => {
  it('adds hd param when workspace domain is provided', async () => {
    const { buildAuthUrlWithDomain } = await import('../auth/google-oidc-client.js');
    const cfg = {
      clientId: 'client-id-123',
      clientSecret: 'secret',
      redirectUri: 'https://app.example.com/auth/callback',
    };
    const url = buildAuthUrlWithDomain(cfg, 'state', 'challenge', 'example.com');
    const parsed = new URL(url);
    expect(parsed.searchParams.get('hd')).toBe('example.com');
  });

  it('does not add hd param when workspace domain is empty string', async () => {
    const { buildAuthUrlWithDomain } = await import('../auth/google-oidc-client.js');
    const cfg = {
      clientId: 'client-id-123',
      clientSecret: 'secret',
      redirectUri: 'https://app.example.com/auth/callback',
    };
    const url = buildAuthUrlWithDomain(cfg, 'state', 'challenge', '');
    const parsed = new URL(url);
    expect(parsed.searchParams.has('hd')).toBe(false);
  });

  it('inherits all base params from buildAuthUrl', async () => {
    const { buildAuthUrlWithDomain } = await import('../auth/google-oidc-client.js');
    const cfg = {
      clientId: 'my-client',
      clientSecret: 'secret',
      redirectUri: 'https://app.example.com/callback',
    };
    const url = buildAuthUrlWithDomain(cfg, 'state-001', 'code-challenge', 'corp.com');
    const parsed = new URL(url);
    expect(parsed.searchParams.get('client_id')).toBe('my-client');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
    expect(parsed.searchParams.get('hd')).toBe('corp.com');
  });
});

describe('isAllowedWorkspaceDomain', () => {
  it('returns true when no domain restriction configured (empty string)', async () => {
    const { isAllowedWorkspaceDomain } = await import('../auth/google-oidc-client.js');
    const result = isAllowedWorkspaceDomain(
      { sub: 's', email: 'e@any.com', email_verified: true, name: 'N', hd: 'any.com' },
      ''
    );
    expect(result).toBe(true);
  });

  it('returns true when payload.hd matches required domain', async () => {
    const { isAllowedWorkspaceDomain } = await import('../auth/google-oidc-client.js');
    const result = isAllowedWorkspaceDomain(
      { sub: 's', email: 'user@corp.com', email_verified: true, name: 'N', hd: 'corp.com' },
      'corp.com'
    );
    expect(result).toBe(true);
  });

  it('returns false when payload.hd does not match required domain', async () => {
    const { isAllowedWorkspaceDomain } = await import('../auth/google-oidc-client.js');
    const result = isAllowedWorkspaceDomain(
      { sub: 's', email: 'user@other.com', email_verified: true, name: 'N', hd: 'other.com' },
      'corp.com'
    );
    expect(result).toBe(false);
  });

  it('returns false when payload.hd is absent and domain restriction is set', async () => {
    const { isAllowedWorkspaceDomain } = await import('../auth/google-oidc-client.js');
    const result = isAllowedWorkspaceDomain(
      { sub: 's', email: 'user@gmail.com', email_verified: true, name: 'N' },
      'corp.com'
    );
    expect(result).toBe(false);
  });
});

describe('verifyIdToken error paths', () => {
  it('throws when ID token is invalid (JWKS verification fails)', async () => {
    const { verifyIdToken } = await import('../auth/google-oidc-client.js');
    await expect(verifyIdToken('not-a-valid-jwt', 'client-id')).rejects.toThrow();
  });
});
