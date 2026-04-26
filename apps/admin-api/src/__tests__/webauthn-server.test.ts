import { describe, expect, it, vi } from 'vitest';
// Tests for webauthn-server.ts
// Covers: buildRegistrationOptions, confirmRegistration,
//         buildAuthenticationOptions, confirmAuthentication

vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: vi.fn().mockResolvedValue({
    challenge: 'base64challenge',
    rp: { name: 'Test App', id: 'localhost' },
    user: { id: 'dXNlcg==', name: 'user@test.com', displayName: 'Test User' },
    pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
    timeout: 60000,
    excludeCredentials: [],
    attestation: 'none',
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  }),
  verifyRegistrationResponse: vi.fn().mockResolvedValue({
    verified: true,
    registrationInfo: {
      credential: { id: 'cred-id-base64', publicKey: new Uint8Array([1, 2, 3]), counter: 0 },
    },
  }),
  generateAuthenticationOptions: vi.fn().mockResolvedValue({
    challenge: 'base64auth-challenge',
    timeout: 60000,
    rpId: 'localhost',
    allowCredentials: [],
    userVerification: 'preferred',
  }),
  verifyAuthenticationResponse: vi.fn().mockResolvedValue({
    verified: true,
    authenticationInfo: { newCounter: 1 },
  }),
}));

const CFG = { rpId: 'localhost', rpName: 'Test Wallet', origin: 'https://localhost:3000' };

describe('buildRegistrationOptions', () => {
  it('calls generateRegistrationOptions with correct rpId and rpName', async () => {
    const { buildRegistrationOptions } = await import('../auth/webauthn-server.js');
    const { generateRegistrationOptions } = await import('@simplewebauthn/server');

    const result = await buildRegistrationOptions(
      CFG,
      'user-001',
      'user@test.com',
      'Test User',
      []
    );
    expect(generateRegistrationOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        rpID: 'localhost',
        rpName: 'Test Wallet',
        userName: 'user@test.com',
        userDisplayName: 'Test User',
        attestationType: 'none',
      })
    );
    expect(result).toBeDefined();
  });

  it('encodes userId as Uint8Array via TextEncoder', async () => {
    const { buildRegistrationOptions } = await import('../auth/webauthn-server.js');
    const { generateRegistrationOptions } = await import('@simplewebauthn/server');
    vi.mocked(generateRegistrationOptions).mockClear();

    await buildRegistrationOptions(CFG, 'user-abc', 'user@test.com', 'User', []);
    const callArgs = vi.mocked(generateRegistrationOptions).mock.calls[0][0];
    expect(callArgs.userID).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(callArgs.userID as Uint8Array)).toBe('user-abc');
  });

  it('excludes existing credential IDs', async () => {
    const { buildRegistrationOptions } = await import('../auth/webauthn-server.js');
    const { generateRegistrationOptions } = await import('@simplewebauthn/server');
    vi.mocked(generateRegistrationOptions).mockClear();

    await buildRegistrationOptions(CFG, 'user-001', 'user@test.com', 'User', ['cred-1', 'cred-2']);
    const callArgs = vi.mocked(generateRegistrationOptions).mock.calls[0][0];
    expect(callArgs.excludeCredentials).toHaveLength(2);
    expect(callArgs.excludeCredentials?.[0].id).toBe('cred-1');
  });

  it('returns empty excludeCredentials when none provided', async () => {
    const { buildRegistrationOptions } = await import('../auth/webauthn-server.js');
    const { generateRegistrationOptions } = await import('@simplewebauthn/server');
    vi.mocked(generateRegistrationOptions).mockClear();

    await buildRegistrationOptions(CFG, 'user-001', 'user@test.com', 'User', []);
    const callArgs = vi.mocked(generateRegistrationOptions).mock.calls[0][0];
    expect(callArgs.excludeCredentials).toHaveLength(0);
  });
});

describe('confirmRegistration', () => {
  it('calls verifyRegistrationResponse with expected challenge and origin', async () => {
    const { confirmRegistration } = await import('../auth/webauthn-server.js');
    const { verifyRegistrationResponse } = await import('@simplewebauthn/server');

    const fakeResponse = { id: 'resp-id', rawId: 'rawId', type: 'public-key' } as never;
    const result = await confirmRegistration(CFG, fakeResponse, 'expected-challenge');

    expect(verifyRegistrationResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedChallenge: 'expected-challenge',
        expectedOrigin: 'https://localhost:3000',
        expectedRPID: 'localhost',
        requireUserVerification: true,
      })
    );
    expect(result).toMatchObject({ verified: true });
  });
});

describe('buildAuthenticationOptions', () => {
  it('calls generateAuthenticationOptions with rpId and allowCredentials', async () => {
    const { buildAuthenticationOptions } = await import('../auth/webauthn-server.js');
    const { generateAuthenticationOptions } = await import('@simplewebauthn/server');
    vi.mocked(generateAuthenticationOptions).mockClear();

    const result = await buildAuthenticationOptions(CFG, ['cred-id-001']);
    expect(generateAuthenticationOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        rpID: 'localhost',
        userVerification: 'preferred',
        timeout: 60_000,
      })
    );
    expect(vi.mocked(generateAuthenticationOptions).mock.calls[0][0].allowCredentials).toHaveLength(
      1
    );
    expect(result).toBeDefined();
  });

  it('passes empty allowCredentials when no credential IDs provided', async () => {
    const { buildAuthenticationOptions } = await import('../auth/webauthn-server.js');
    const { generateAuthenticationOptions } = await import('@simplewebauthn/server');
    vi.mocked(generateAuthenticationOptions).mockClear();

    await buildAuthenticationOptions(CFG, []);
    const callArgs = vi.mocked(generateAuthenticationOptions).mock.calls[0][0];
    expect(callArgs.allowCredentials).toHaveLength(0);
  });
});

describe('confirmAuthentication', () => {
  it('calls verifyAuthenticationResponse with stored credential details', async () => {
    const { confirmAuthentication } = await import('../auth/webauthn-server.js');
    const { verifyAuthenticationResponse } = await import('@simplewebauthn/server');

    const storedCredential = {
      credentialId: 'stored-cred-id',
      publicKey: new Uint8Array([4, 5, 6]),
      counter: 5,
      transports: ['internal' as const],
    };

    const fakeResponse = { id: 'resp-id', rawId: 'rawId', type: 'public-key' } as never;
    const result = await confirmAuthentication(
      CFG,
      fakeResponse,
      'auth-challenge',
      storedCredential
    );

    expect(verifyAuthenticationResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedChallenge: 'auth-challenge',
        expectedOrigin: 'https://localhost:3000',
        expectedRPID: 'localhost',
        requireUserVerification: true,
        authenticator: expect.objectContaining({
          credentialID: 'stored-cred-id',
          counter: 5,
        }),
      })
    );
    expect(result).toMatchObject({ verified: true });
  });
});
