import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { JWTPayload } from 'jose';
// Google Workspace OIDC helpers — authorization URL, token exchange, ID token verification
// Uses oauth4webapi for PKCE/token exchange and jose for JWKS-backed JWT verification.
// NEVER log id_token, access_token, or client_secret in any code path.
import * as oauth from 'oauth4webapi';

// Google OIDC discovery — well-known endpoints
const GOOGLE_ISSUER = new URL('https://accounts.google.com');
const GOOGLE_JWKS_URI = new URL('https://www.googleapis.com/oauth2/v3/certs');

// Cached JWKS set — jose handles internal refresh
const googleJwks = createRemoteJWKSet(GOOGLE_JWKS_URI);

export interface GoogleIdPayload {
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  picture?: string;
  /** Hosted domain (Workspace) — present only for @workspace accounts */
  hd?: string;
}

export interface OidcClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Build the Google OAuth2 authorization URL with PKCE (S256).
 * Returns the URL string to redirect the user to.
 */
export function buildAuthUrl(cfg: OidcClientConfig, state: string, codeChallenge: string): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('redirect_uri', cfg.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('access_type', 'online');
  return url.toString();
}

/**
 * Build the authorization URL with an optional hosted-domain hint.
 * hd restricts the consent screen to one Workspace domain.
 * Decision D3: only applied when GOOGLE_WORKSPACE_DOMAIN env is non-empty.
 */
export function buildAuthUrlWithDomain(
  cfg: OidcClientConfig,
  state: string,
  codeChallenge: string,
  workspaceDomain: string
): string {
  const url = new URL(buildAuthUrl(cfg, state, codeChallenge));
  if (workspaceDomain) {
    url.searchParams.set('hd', workspaceDomain);
  }
  return url.toString();
}

/**
 * Exchange the authorization code for an ID token.
 * Uses oauth4webapi v3 flow:
 *   1. Discover AS metadata
 *   2. validateAuthResponse() → branded URLSearchParams (required by authorizationCodeGrantRequest)
 *   3. authorizationCodeGrantRequest() → token endpoint POST with PKCE
 *   4. processAuthorizationCodeResponse() → extract id_token
 */
export async function exchangeCodeForIdToken(
  cfg: OidcClientConfig,
  code: string,
  codeVerifier: string
): Promise<string> {
  const issuer = GOOGLE_ISSUER;
  const discoveryResponse = await oauth.discoveryRequest(issuer, { algorithm: 'oidc' });
  const as = await oauth.processDiscoveryResponse(issuer, discoveryResponse);

  const client: oauth.Client = { client_id: cfg.clientId };
  const clientAuth = oauth.ClientSecretPost(cfg.clientSecret);

  // Build the callback URL with the code — validateAuthResponse extracts + validates it
  const callbackUrl = new URL(cfg.redirectUri);
  callbackUrl.searchParams.set('code', code);

  // validateAuthResponse returns branded URLSearchParams required by authorizationCodeGrantRequest
  const callbackParams = oauth.validateAuthResponse(as, client, callbackUrl);

  const codeGrantResponse = await oauth.authorizationCodeGrantRequest(
    as,
    client,
    clientAuth,
    callbackParams,
    cfg.redirectUri,
    codeVerifier
  );

  const result = await oauth.processAuthorizationCodeResponse(as, client, codeGrantResponse);

  if (!result.id_token) {
    throw new Error('Google token response missing id_token');
  }
  return result.id_token;
}

/**
 * Verify the Google ID token against Google's JWKS.
 * Validates: signature, iss, aud, exp, nbf.
 */
export async function verifyIdToken(idToken: string, clientId: string): Promise<GoogleIdPayload> {
  const { payload } = await jwtVerify(idToken, googleJwks, {
    issuer: 'https://accounts.google.com',
    audience: clientId,
  });

  const p = payload as JWTPayload & Record<string, unknown>;

  if (!p.email || typeof p.email !== 'string') {
    throw new Error('ID token missing email claim');
  }
  if (!p.sub || typeof p.sub !== 'string') {
    throw new Error('ID token missing sub claim');
  }

  const result: GoogleIdPayload = {
    sub: p.sub,
    email: p.email,
    email_verified: Boolean(p.email_verified),
    name: typeof p.name === 'string' ? p.name : '',
  };

  // Only set optional fields when present — exactOptionalPropertyTypes requires this
  if (typeof p.picture === 'string') {
    result.picture = p.picture;
  }
  if (typeof p.hd === 'string') {
    result.hd = p.hd;
  }

  return result;
}

/**
 * Verify hd claim matches required workspace domain.
 * Decision D3: domain enforcement via env var — never hardcoded.
 * Returns true if allowed (domain not configured, or domain matches).
 */
export function isAllowedWorkspaceDomain(
  payload: GoogleIdPayload,
  requiredDomain: string
): boolean {
  // Empty string = no domain restriction
  if (!requiredDomain) return true;
  return payload.hd === requiredDomain;
}
