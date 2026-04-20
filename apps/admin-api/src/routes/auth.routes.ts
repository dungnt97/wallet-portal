// Auth routes — composes OIDC and WebAuthn sub-routers
// Replaces P04 stubs with real Google Workspace OIDC + WebAuthn step-up.
//
// OIDC endpoints:
//   POST /auth/session/initiate  — returns Google auth URL (PKCE)
//   GET  /auth/session/callback  — exchanges code, sets session
//   GET  /auth/me                — returns current session staff
//   POST /auth/session/logout    — destroys session
//
// WebAuthn endpoints:
//   POST /auth/webauthn/register/options — attestation options
//   POST /auth/webauthn/register/verify  — store credential
//   POST /auth/webauthn/challenge        — assertion options (step-up)
//   POST /auth/webauthn/verify           — verify assertion, set steppedUpAt
import type { FastifyPluginAsync } from 'fastify';
import { oidcRoutes } from '../auth/oidc-routes.js';
import { webauthnRoutes } from '../auth/webauthn-routes.js';
import type { Config } from '../config/env.js';

const authRoutes: FastifyPluginAsync<{ cfg: Config }> = async (app, opts) => {
  await app.register(oidcRoutes, { cfg: opts.cfg });
  await app.register(webauthnRoutes, { cfg: opts.cfg });
};

export default authRoutes;
