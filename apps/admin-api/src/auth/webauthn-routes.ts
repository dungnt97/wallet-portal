import type {
  VerifyAuthenticationResponseOpts,
  VerifyRegistrationResponseOpts,
} from '@simplewebauthn/server';
import { and, eq } from 'drizzle-orm';
// WebAuthn route handlers — credential registration + step-up assertion
// POST /auth/webauthn/register/options — generate attestation options (requires session)
// POST /auth/webauthn/register/verify  — verify + store new credential
// POST /auth/webauthn/challenge        — generate assertion options for step-up
// POST /auth/webauthn/verify           — verify assertion, set steppedUpAt in session
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Config } from '../config/env.js';
import { staffMembers, staffWebauthnCredentials } from '../db/schema/index.js';
import { requireAuth } from './rbac.middleware.js';
import {
  buildAuthenticationOptions,
  buildRegistrationOptions,
  confirmAuthentication,
  confirmRegistration,
} from './webauthn-server.js';

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export const webauthnRoutes: FastifyPluginAsync<{ cfg: Config }> = async (app, opts) => {
  const { cfg } = opts;
  const r = app.withTypeProvider<ZodTypeProvider>();

  const waCfg = {
    rpId: cfg.WEBAUTHN_RP_ID,
    rpName: cfg.WEBAUTHN_RP_NAME,
    origin: cfg.WEBAUTHN_ORIGIN,
  };

  // ── Registration ────────────────────────────────────────────────────────────

  // POST /auth/webauthn/register/options — generate attestation options
  r.post(
    '/auth/webauthn/register/options',
    {
      preHandler: requireAuth(),
      schema: {
        tags: ['auth'],
        body: z.object({ deviceName: z.string().min(1).max(100).optional() }),
        response: { 200: z.record(z.unknown()) },
      },
    },
    async (req, reply) => {
      const staff = req.session.staff!;

      // Fetch existing credentials to exclude from new registration
      const existing = await app.db
        .select({ credentialId: staffWebauthnCredentials.credentialId })
        .from(staffWebauthnCredentials)
        .where(eq(staffWebauthnCredentials.staffId, staff.id));

      const staffRow = await app.db
        .select({ name: staffMembers.name })
        .from(staffMembers)
        .where(eq(staffMembers.id, staff.id))
        .limit(1);

      const displayName = staffRow[0]?.name ?? staff.email;

      const options = await buildRegistrationOptions(
        waCfg,
        staff.id,
        staff.email,
        displayName,
        existing.map((e) => e.credentialId)
      );

      req.session.webauthnChallenge = options.challenge as string;
      req.session.webauthnChallengeExpiresAt = Date.now() + CHALLENGE_TTL_MS;

      const body = req.body as { deviceName?: string };
      if (body.deviceName) {
        (req.session as unknown as Record<string, unknown>).pendingDeviceName = body.deviceName;
      }

      return reply.code(200).send(options as unknown as Record<string, unknown>);
    }
  );

  // POST /auth/webauthn/register/verify — verify attestation, persist credential
  r.post(
    '/auth/webauthn/register/verify',
    {
      preHandler: requireAuth(),
      schema: {
        tags: ['auth'],
        body: z.record(z.unknown()),
        response: {
          200: z.object({ ok: z.boolean(), credentialId: z.string() }),
          400: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const staff = req.session.staff!;
      const challenge = req.session.webauthnChallenge;
      const expiresAt = req.session.webauthnChallengeExpiresAt ?? 0;

      if (!challenge || Date.now() > expiresAt) {
        return reply.code(400).send({
          code: 'CHALLENGE_EXPIRED',
          message: 'Registration challenge expired — restart flow',
        });
      }

      // Clear challenge — one-time use
      (req.session as unknown as Record<string, unknown>).webauthnChallenge = undefined;
      (req.session as unknown as Record<string, unknown>).webauthnChallengeExpiresAt = undefined;

      let verification;
      try {
        verification = await confirmRegistration(
          waCfg,
          req.body as unknown as VerifyRegistrationResponseOpts['response'],
          challenge
        );
      } catch (err) {
        app.log.warn({ err }, 'WebAuthn registration verification failed');
        return reply
          .code(400)
          .send({ code: 'VERIFICATION_FAILED', message: 'Credential verification failed' });
      }

      if (!verification.verified || !verification.registrationInfo) {
        return reply
          .code(400)
          .send({ code: 'VERIFICATION_FAILED', message: 'Credential not verified' });
      }

      const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;
      const deviceName =
        ((req.session as unknown as Record<string, unknown>).pendingDeviceName as
          | string
          | undefined) ?? 'Security Key';
      (req.session as unknown as Record<string, unknown>).pendingDeviceName = undefined;

      await app.db.insert(staffWebauthnCredentials).values({
        staffId: staff.id,
        credentialId: credentialID,
        publicKey: Buffer.from(credentialPublicKey),
        counter: BigInt(counter),
        transports: [],
        deviceName,
      });

      return reply.code(200).send({ ok: true, credentialId: credentialID });
    }
  );

  // ── Authentication / step-up ─────────────────────────────────────────────────

  // POST /auth/webauthn/challenge — generate assertion options for step-up
  r.post(
    '/auth/webauthn/challenge',
    {
      preHandler: requireAuth(),
      schema: {
        tags: ['auth'],
        response: { 200: z.record(z.unknown()) },
      },
    },
    async (req, reply) => {
      const staff = req.session.staff!;

      const creds = await app.db
        .select({ credentialId: staffWebauthnCredentials.credentialId })
        .from(staffWebauthnCredentials)
        .where(eq(staffWebauthnCredentials.staffId, staff.id));

      const options = await buildAuthenticationOptions(
        waCfg,
        creds.map((c) => c.credentialId)
      );

      req.session.webauthnChallenge = options.challenge as string;
      req.session.webauthnChallengeExpiresAt = Date.now() + CHALLENGE_TTL_MS;

      return reply.code(200).send(options as unknown as Record<string, unknown>);
    }
  );

  // POST /auth/webauthn/verify — verify assertion, set steppedUpAt
  r.post(
    '/auth/webauthn/verify',
    {
      preHandler: requireAuth(),
      schema: {
        tags: ['auth'],
        body: z.record(z.unknown()),
        response: {
          200: z.object({ ok: z.boolean(), steppedUpAt: z.string() }),
          400: z.object({ code: z.string(), message: z.string() }),
        },
      },
    },
    async (req, reply) => {
      const staff = req.session.staff!;
      const challenge = req.session.webauthnChallenge;
      const expiresAt = req.session.webauthnChallengeExpiresAt ?? 0;

      if (!challenge || Date.now() > expiresAt) {
        return reply.code(400).send({
          code: 'CHALLENGE_EXPIRED',
          message: 'Authentication challenge expired — restart flow',
        });
      }

      const responseBody = req.body as { id?: string };
      const credentialId = responseBody.id;
      if (!credentialId) {
        return reply
          .code(400)
          .send({ code: 'MISSING_CREDENTIAL_ID', message: 'Response missing credential id' });
      }

      const stored = await app.db
        .select()
        .from(staffWebauthnCredentials)
        .where(
          and(
            eq(staffWebauthnCredentials.staffId, staff.id),
            eq(staffWebauthnCredentials.credentialId, credentialId)
          )
        )
        .limit(1);

      if (!stored[0]) {
        return reply.code(400).send({
          code: 'CREDENTIAL_NOT_FOUND',
          message: 'Credential not registered to this account',
        });
      }

      const row = stored[0];

      // Clear challenge — one-time use
      (req.session as unknown as Record<string, unknown>).webauthnChallenge = undefined;
      (req.session as unknown as Record<string, unknown>).webauthnChallengeExpiresAt = undefined;

      let verification;
      try {
        verification = await confirmAuthentication(
          waCfg,
          req.body as unknown as VerifyAuthenticationResponseOpts['response'],
          challenge,
          {
            credentialId: row.credentialId,
            publicKey: new Uint8Array(row.publicKey as unknown as ArrayBuffer),
            counter: Number(row.counter ?? BigInt(0)),
            transports: (row.transports ?? []) as (
              | 'ble'
              | 'hybrid'
              | 'internal'
              | 'nfc'
              | 'usb'
              | 'smart-card'
              | 'cable'
            )[],
          }
        );
      } catch (err) {
        app.log.warn({ err }, 'WebAuthn assertion verification failed');
        return reply
          .code(400)
          .send({ code: 'VERIFICATION_FAILED', message: 'Assertion verification failed' });
      }

      if (!verification.verified) {
        return reply
          .code(400)
          .send({ code: 'VERIFICATION_FAILED', message: 'Assertion not verified' });
      }

      // Update counter in DB — prevents cloned-key replay
      await app.db
        .update(staffWebauthnCredentials)
        .set({
          counter: BigInt(verification.authenticationInfo.newCounter),
          lastUsedAt: new Date(),
        })
        .where(eq(staffWebauthnCredentials.credentialId, credentialId));

      const now = new Date().toISOString();
      req.session.steppedUpAt = now;

      return reply.code(200).send({ ok: true, steppedUpAt: now });
    }
  );
};
