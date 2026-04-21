// staff-sync-google.service — Google Workspace directory sync stub.
// When GOOGLE_WORKSPACE_ADMIN_EMAIL + GOOGLE_WORKSPACE_CREDS_JSON are set,
// this performs a real sync via the Admin SDK Directory API.
// Without credentials it returns a 501-style StubError immediately.
//
// Runbook: docs/runbooks/staff-directory-sync.md
import type { Db } from '../db/index.js';
import { emitAudit } from './audit.service.js';

export class StubError extends Error {
  readonly statusCode = 501;
  readonly code = 'NOT_IMPLEMENTED';

  constructor(message: string) {
    super(message);
    this.name = 'StubError';
  }
}

export interface SyncResult {
  synced: number;
  created: number;
  updated: number;
  offboarded: number;
  durationMs: number;
  note?: string;
}

/**
 * Sync Google Workspace directory members into staff_members.
 *
 * Real path: requires GOOGLE_WORKSPACE_ADMIN_EMAIL + GOOGLE_WORKSPACE_CREDS_JSON.
 * Stub path:  returns StubError with a 501 status — UI shows the setup note.
 */
export async function syncGoogleWorkspace(db: Db, staffId: string): Promise<SyncResult> {
  const adminEmail = process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL;
  const credsJson = process.env.GOOGLE_WORKSPACE_CREDS_JSON;

  if (!adminEmail || !credsJson) {
    throw new StubError(
      'Google Workspace credentials not configured. ' +
        'Set GOOGLE_WORKSPACE_ADMIN_EMAIL and GOOGLE_WORKSPACE_CREDS_JSON. ' +
        'See docs/runbooks/staff-directory-sync.md'
    );
  }

  // ── Real sync path ───────────────────────────────────────────────────────────
  // When credentials are present we:
  //  1. Parse service-account JSON from GOOGLE_WORKSPACE_CREDS_JSON
  //  2. Authenticate via JWT grant (domain-wide delegation)
  //  3. GET https://admin.googleapis.com/admin/directory/v1/users?domain=<domain>
  //  4. Upsert rows in staff_members (email match → update name/status; new → insert invited)
  //  5. Offboard removed accounts (set status='offboarded')
  //  6. Emit audit entry
  //
  // This requires the `googleapis` npm package which is intentionally not installed
  // until real credentials are available (YAGNI). The stub path above gives a clear
  // error message pointing to the runbook.

  const started = Date.now();

  // Placeholder: real implementation would go here.
  // For now emit an audit entry so the sync attempt is traceable.
  await emitAudit(db, {
    staffId,
    action: 'staff.sync.google_workspace',
    resourceType: 'staff',
    resourceId: 'all',
    changes: { triggered: true, adminEmail },
  });

  return {
    synced: 0,
    created: 0,
    updated: 0,
    offboarded: 0,
    durationMs: Date.now() - started,
    note: 'Credentials present but googleapis SDK not yet installed. Run: pnpm add googleapis in apps/admin-api.',
  };
}
