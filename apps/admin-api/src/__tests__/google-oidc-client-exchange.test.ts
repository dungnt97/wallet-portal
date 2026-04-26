import { describe, expect, it, vi } from 'vitest';
// Supplemental tests for auth/google-oidc-client.ts
// Covers lines 126-145: verifyIdToken optional fields (picture, hd)
//                       exchangeCodeForIdToken error paths

// ── Mock jose JWKS verification ───────────────────────────────────────────────

vi.mock('jose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('jose')>();
  return {
    ...actual,
    createRemoteJWKSet: vi.fn().mockReturnValue(vi.fn()),
    jwtVerify: vi.fn().mockResolvedValue({
      payload: {
        sub: 'google-sub-001',
        email: 'user@corp.com',
        email_verified: true,
        name: 'Test User',
        picture: 'https://lh3.googleusercontent.com/photo.jpg',
        hd: 'corp.com',
      },
    }),
  };
});

// ── Mock oauth4webapi for exchangeCodeForIdToken ───────────────────────────────

const mockDiscoveryRequest = vi.fn();
const mockProcessDiscovery = vi.fn();
const mockValidateAuthResponse = vi.fn();
const mockAuthCodeGrantRequest = vi.fn();
const mockProcessAuthCodeResponse = vi.fn();
const mockClientSecretPost = vi.fn().mockReturnValue({ type: 'client_secret_post' });

vi.mock('oauth4webapi', () => ({
  discoveryRequest: (...args: unknown[]) => mockDiscoveryRequest(...args),
  processDiscoveryResponse: (...args: unknown[]) => mockProcessDiscovery(...args),
  validateAuthResponse: (...args: unknown[]) => mockValidateAuthResponse(...args),
  authorizationCodeGrantRequest: (...args: unknown[]) => mockAuthCodeGrantRequest(...args),
  processAuthorizationCodeResponse: (...args: unknown[]) => mockProcessAuthCodeResponse(...args),
  ClientSecretPost: (...args: unknown[]) => mockClientSecretPost(...args),
}));

// ── Tests: verifyIdToken with optional fields ─────────────────────────────────

describe('verifyIdToken — optional fields in payload', () => {
  it('sets result.picture when payload.picture is a string', async () => {
    const { jwtVerify } = await import('jose');
    vi.mocked(jwtVerify).mockResolvedValueOnce({
      payload: {
        sub: 's',
        email: 'u@corp.com',
        email_verified: true,
        name: 'U',
        picture: 'https://photo.example.com/img.jpg',
      },
    } as never);

    const { verifyIdToken } = await import('../auth/google-oidc-client.js');
    const result = await verifyIdToken('valid-token', 'client-id');

    expect(result.picture).toBe('https://photo.example.com/img.jpg');
  });

  it('does not set result.picture when payload.picture is absent', async () => {
    const { jwtVerify } = await import('jose');
    vi.mocked(jwtVerify).mockResolvedValueOnce({
      payload: { sub: 's', email: 'u@corp.com', email_verified: true, name: 'U' },
    } as never);

    const { verifyIdToken } = await import('../auth/google-oidc-client.js');
    const result = await verifyIdToken('valid-token', 'client-id');

    expect('picture' in result).toBe(false);
  });

  it('sets result.hd when payload.hd is a string', async () => {
    const { jwtVerify } = await import('jose');
    vi.mocked(jwtVerify).mockResolvedValueOnce({
      payload: {
        sub: 's',
        email: 'u@corp.com',
        email_verified: true,
        name: 'U',
        hd: 'corp.com',
      },
    } as never);

    const { verifyIdToken } = await import('../auth/google-oidc-client.js');
    const result = await verifyIdToken('valid-token', 'client-id');

    expect(result.hd).toBe('corp.com');
  });

  it('does not set result.hd when payload.hd is absent (personal account)', async () => {
    const { jwtVerify } = await import('jose');
    vi.mocked(jwtVerify).mockResolvedValueOnce({
      payload: { sub: 's', email: 'u@gmail.com', email_verified: true, name: 'U' },
    } as never);

    const { verifyIdToken } = await import('../auth/google-oidc-client.js');
    const result = await verifyIdToken('valid-token', 'client-id');

    expect('hd' in result).toBe(false);
  });

  it('throws when payload.email is missing', async () => {
    const { jwtVerify } = await import('jose');
    vi.mocked(jwtVerify).mockResolvedValueOnce({
      payload: { sub: 's', email_verified: true, name: 'U' },
    } as never);

    const { verifyIdToken } = await import('../auth/google-oidc-client.js');
    await expect(verifyIdToken('valid-token', 'client-id')).rejects.toThrow(
      'ID token missing email claim'
    );
  });

  it('throws when payload.sub is missing', async () => {
    const { jwtVerify } = await import('jose');
    vi.mocked(jwtVerify).mockResolvedValueOnce({
      payload: { email: 'u@corp.com', email_verified: true, name: 'U' },
    } as never);

    const { verifyIdToken } = await import('../auth/google-oidc-client.js');
    await expect(verifyIdToken('valid-token', 'client-id')).rejects.toThrow(
      'ID token missing sub claim'
    );
  });
});

// ── Tests: exchangeCodeForIdToken ─────────────────────────────────────────────

describe('exchangeCodeForIdToken', () => {
  const CFG = {
    clientId: 'client-id-test',
    clientSecret: 'secret-test',
    redirectUri: 'https://app.test/auth/callback',
  };

  it('returns id_token on successful exchange', async () => {
    const mockAs = {
      issuer: 'https://accounts.google.com',
      authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      token_endpoint: 'https://oauth2.googleapis.com/token',
    };
    mockDiscoveryRequest.mockResolvedValueOnce({} as never);
    mockProcessDiscovery.mockResolvedValueOnce(mockAs);
    mockValidateAuthResponse.mockReturnValueOnce(new URLSearchParams({ code: 'auth-code-001' }));
    mockAuthCodeGrantRequest.mockResolvedValueOnce({} as never);
    mockProcessAuthCodeResponse.mockResolvedValueOnce({ id_token: 'returned-id-token-abc' });

    const { exchangeCodeForIdToken } = await import('../auth/google-oidc-client.js');
    const token = await exchangeCodeForIdToken(CFG, 'auth-code-001', 'pkce-verifier-xyz');

    expect(token).toBe('returned-id-token-abc');
  });

  it('throws when token response has no id_token', async () => {
    const mockAs = {
      issuer: 'https://accounts.google.com',
      token_endpoint: 'https://oauth2.googleapis.com/token',
    };
    mockDiscoveryRequest.mockResolvedValueOnce({} as never);
    mockProcessDiscovery.mockResolvedValueOnce(mockAs);
    mockValidateAuthResponse.mockReturnValueOnce(new URLSearchParams({ code: 'code' }));
    mockAuthCodeGrantRequest.mockResolvedValueOnce({} as never);
    mockProcessAuthCodeResponse.mockResolvedValueOnce({ access_token: 'at', token_type: 'Bearer' });

    const { exchangeCodeForIdToken } = await import('../auth/google-oidc-client.js');
    await expect(exchangeCodeForIdToken(CFG, 'auth-code-002', 'pkce-verifier-xyz')).rejects.toThrow(
      'Google token response missing id_token'
    );
  });

  it('propagates discovery errors', async () => {
    mockDiscoveryRequest.mockRejectedValueOnce(new Error('DNS lookup failed'));

    const { exchangeCodeForIdToken } = await import('../auth/google-oidc-client.js');
    await expect(exchangeCodeForIdToken(CFG, 'code', 'verifier')).rejects.toThrow(
      'DNS lookup failed'
    );
  });
});
