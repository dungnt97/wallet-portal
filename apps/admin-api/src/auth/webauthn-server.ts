// WebAuthn server helpers — thin wrappers around @simplewebauthn/server v10
// Handles registration (attestation) and authentication (assertion) ceremonies.
// NOTE: @simplewebauthn/server v10 bundles all types — no separate @simplewebauthn/types package.
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  GenerateAuthenticationOptionsOpts,
  GenerateRegistrationOptionsOpts,
  VerifyAuthenticationResponseOpts,
  VerifyRegistrationResponseOpts,
} from '@simplewebauthn/server';

export interface WebAuthnConfig {
  rpId: string;
  rpName: string;
  origin: string;
}

// Transport strings — v10 bundles these types; we use string literals directly
type AuthenticatorTransport =
  | 'ble'
  | 'hybrid'
  | 'internal'
  | 'nfc'
  | 'usb'
  | 'smart-card'
  | 'cable';

export interface StoredCredential {
  credentialId: string;
  publicKey: Uint8Array;
  counter: number;
  transports: AuthenticatorTransport[];
}

const ALL_TRANSPORTS: AuthenticatorTransport[] = ['internal', 'usb', 'ble', 'nfc', 'hybrid'];

// ── Registration ──────────────────────────────────────────────────────────────

/**
 * Generate attestation options for a new credential registration.
 * Challenge is embedded in the returned options — caller must store it in session.
 */
// Return type is explicitly Promise<Record<string,unknown>> to avoid referencing the
// transitive @simplewebauthn/types package which is not directly installed (TS2742).
export async function buildRegistrationOptions(
  cfg: WebAuthnConfig,
  userId: string,
  userName: string,
  userDisplayName: string,
  excludeCredentialIds: string[]
): Promise<Record<string, unknown>> {
  const opts: GenerateRegistrationOptionsOpts = {
    rpID: cfg.rpId,
    rpName: cfg.rpName,
    userID: new TextEncoder().encode(userId),
    userName,
    userDisplayName,
    attestationType: 'none',
    excludeCredentials: excludeCredentialIds.map((id) => ({
      id,
      transports: ALL_TRANSPORTS,
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  };
  // Cast needed: PublicKeyCredentialCreationOptionsJSON lacks string index signature
  return generateRegistrationOptions(opts) as unknown as Promise<Record<string, unknown>>;
}

/**
 * Verify a registration response from the browser.
 * Returns the verified registrationInfo on success.
 */
export async function confirmRegistration(
  cfg: WebAuthnConfig,
  // Response body is an opaque JSON object from the browser — type-cast at call site
  response: VerifyRegistrationResponseOpts['response'],
  expectedChallenge: string
) {
  const opts: VerifyRegistrationResponseOpts = {
    response,
    expectedChallenge,
    expectedOrigin: cfg.origin,
    expectedRPID: cfg.rpId,
    requireUserVerification: true,
  };
  return verifyRegistrationResponse(opts);
}

// ── Authentication (step-up assertion) ───────────────────────────────────────

/**
 * Generate assertion options for a step-up authentication ceremony.
 * allowCredentials restricts to credentials belonging to the current staff.
 */
// Return type is explicitly Promise<Record<string,unknown>> to avoid referencing the
// transitive @simplewebauthn/types package which is not directly installed (TS2742).
export async function buildAuthenticationOptions(
  cfg: WebAuthnConfig,
  allowCredentialIds: string[]
): Promise<Record<string, unknown>> {
  const opts: GenerateAuthenticationOptionsOpts = {
    rpID: cfg.rpId,
    userVerification: 'preferred',
    allowCredentials: allowCredentialIds.map((id) => ({
      id,
      transports: ALL_TRANSPORTS,
    })),
    timeout: 60_000,
  };
  // Cast needed: PublicKeyCredentialRequestOptionsJSON lacks string index signature
  return generateAuthenticationOptions(opts) as unknown as Promise<Record<string, unknown>>;
}

/**
 * Verify an assertion response from the browser.
 * authenticator must reflect the current stored counter + public key.
 * @simplewebauthn/server v10 enforces counter > stored (clone detection).
 */
export async function confirmAuthentication(
  cfg: WebAuthnConfig,
  response: VerifyAuthenticationResponseOpts['response'],
  expectedChallenge: string,
  credential: StoredCredential
) {
  const opts: VerifyAuthenticationResponseOpts = {
    response,
    expectedChallenge,
    expectedOrigin: cfg.origin,
    expectedRPID: cfg.rpId,
    requireUserVerification: true,
    authenticator: {
      credentialID: credential.credentialId,
      credentialPublicKey: credential.publicKey,
      counter: credential.counter,
      transports: credential.transports,
    },
  };
  return verifyAuthenticationResponse(opts);
}
