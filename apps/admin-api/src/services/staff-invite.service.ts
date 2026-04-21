// staff-invite.service — generate signed JWT invite token + create staff row
// Token is short-lived (72h), signed with SESSION_SECRET via jose SignJWT.
// Accept flow: POST /auth/invite/accept verifies token → triggers WebAuthn register.
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { SignJWT, jwtVerify } from 'jose';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';
import { emitAudit } from './audit.service.js';

const TOKEN_TTL_HOURS = 72;
const APP_BASE_URL = process.env.APP_BASE_URL ?? 'https://app.wallet-portal.example.com';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InviteStaffParams {
  email: string;
  name: string;
  role: 'admin' | 'treasurer' | 'operator' | 'viewer';
  invitedByStaffId: string;
}

export interface InviteResult {
  staffId: string;
  inviteLink: string;
  expiresAt: string;
}

export interface InviteTokenPayload {
  sub: string; // staffId
  email: string;
  role: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getJwtSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET env var is required for invite token signing');
  return new TextEncoder().encode(secret);
}

// ── Service functions ─────────────────────────────────────────────────────────

/**
 * Create a staff row with status='invited' and a signed JWT invite link.
 * Idempotent on email: if staff already exists in 'invited' status, re-issues token.
 */
export async function inviteStaff(db: Db, params: InviteStaffParams): Promise<InviteResult> {
  const { email, name, role, invitedByStaffId } = params;

  const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000);

  // Check for existing staff row
  const existing = await db
    .select({ id: schema.staffMembers.id, status: schema.staffMembers.status })
    .from(schema.staffMembers)
    .where(eq(schema.staffMembers.email, email))
    .limit(1);

  const existingRow = existing[0];
  if (existingRow && existingRow.status !== 'invited') {
    throw new Error(`Staff member with email ${email} already exists and is active`);
  }

  // Upsert staff row
  let staffId: string;
  if (existingRow) {
    staffId = existingRow.id;
  } else {
    staffId = randomUUID();
    await db.insert(schema.staffMembers).values({
      id: staffId,
      email,
      name,
      role,
      status: 'invited' as typeof schema.staffMembers.$inferSelect.status,
    });
  }

  // Sign invite JWT
  const secret = getJwtSecret();
  const token = await new SignJWT({ sub: staffId, email, role } satisfies InviteTokenPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_HOURS}h`)
    .sign(secret);

  // Store token hash on staff row for single-use verification
  await db
    .update(schema.staffMembers)
    .set({ inviteToken: token, inviteExpiresAt: expiresAt, updatedAt: new Date() })
    .where(eq(schema.staffMembers.id, staffId));

  await emitAudit(db, {
    staffId: invitedByStaffId,
    action: 'staff.invite.created',
    resourceType: 'staff',
    resourceId: staffId,
    changes: { email, role, expiresAt: expiresAt.toISOString() },
  });

  const inviteLink = `${APP_BASE_URL}/onboard?token=${encodeURIComponent(token)}`;

  return { staffId, inviteLink, expiresAt: expiresAt.toISOString() };
}

/**
 * Verify an invite token. Returns payload if valid, throws on expired/invalid.
 * Called by onboard page / WebAuthn register flow.
 */
export async function verifyInviteToken(
  db: Db,
  token: string
): Promise<InviteTokenPayload & { staffId: string }> {
  const secret = getJwtSecret();

  let payload: InviteTokenPayload;
  try {
    const result = await jwtVerify(token, secret);
    payload = result.payload as unknown as InviteTokenPayload;
  } catch {
    throw new Error('Invite token is invalid or expired');
  }

  // Verify token still stored on staff row (single-use guard)
  const rows = await db
    .select({ id: schema.staffMembers.id, inviteToken: schema.staffMembers.inviteToken })
    .from(schema.staffMembers)
    .where(eq(schema.staffMembers.id, payload.sub))
    .limit(1);

  const row = rows[0];
  if (!row || row.inviteToken !== token) {
    throw new Error('Invite token has already been used or was revoked');
  }

  return { ...payload, staffId: payload.sub };
}

/**
 * Consume invite token — clear it after WebAuthn registration completes.
 */
export async function consumeInviteToken(db: Db, staffId: string): Promise<void> {
  await db
    .update(schema.staffMembers)
    .set({
      inviteToken: null,
      inviteExpiresAt: null,
      status: 'active',
      updatedAt: new Date(),
    })
    .where(eq(schema.staffMembers.id, staffId));
}
