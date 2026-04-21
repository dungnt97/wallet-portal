# Staff Directory Sync — Google Workspace

## Overview

The staff sync feature imports Google Workspace directory members into `staff_members`. When a staff member is removed from Google Workspace, their account is set to `status='offboarded'` on next sync.

**Route:** `POST /staff/sync-google-workspace` (admin only)

**UI:** Ops page → Staff Directory section → "Sync now" button

---

## Setup

### 1. Create a Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com) → IAM & Admin → Service Accounts
2. Create a new service account (e.g. `wallet-portal-directory-sync`)
3. Download the JSON key file — this is `GOOGLE_WORKSPACE_CREDS_JSON`

### 2. Enable Domain-Wide Delegation

1. In the service account settings, enable **Domain-Wide Delegation**
2. Note the **Client ID** (numeric)
3. Go to [Google Workspace Admin](https://admin.google.com) → Security → API controls → Manage Domain-Wide Delegation
4. Add the Client ID with scopes:
   ```
   https://www.googleapis.com/auth/admin.directory.user.readonly
   ```

### 3. Set Environment Variables

```bash
GOOGLE_WORKSPACE_ADMIN_EMAIL=admin@yourcompany.com
GOOGLE_WORKSPACE_CREDS_JSON='{"type":"service_account","project_id":"...",...}'
```

In production, inject these via your secrets manager (e.g. AWS Secrets Manager, Doppler).

### 4. Install the googleapis SDK

```bash
cd apps/admin-api
pnpm add googleapis
```

Then update `staff-sync-google.service.ts` to implement the real sync path (the stub note in the service file guides the implementation location).

---

## Sync Behaviour

| Action | Condition | Result |
|--------|-----------|--------|
| Create | Email exists in GW, not in DB | Insert `status='invited'` |
| Update | Email in both; name differs | Update name |
| Offboard | Email in DB (`active`), not in GW | Set `status='offboarded'` |
| Skip | Email in DB (`offboarded`/`suspended`) | No change |

Admins are never automatically offboarded — requires manual action.

---

## Dry Run

Without credentials set, `POST /staff/sync-google-workspace` returns:

```json
{
  "code": "NOT_IMPLEMENTED",
  "message": "Google Workspace credentials not configured. Set GOOGLE_WORKSPACE_ADMIN_EMAIL and GOOGLE_WORKSPACE_CREDS_JSON."
}
```

The UI shows this as a setup note, not an error.

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| 501 from API | Env vars missing | Check `GOOGLE_WORKSPACE_ADMIN_EMAIL` + `GOOGLE_WORKSPACE_CREDS_JSON` |
| `unauthorized_client` | DWD not granted | Re-check Admin console API controls |
| `insufficient_permissions` | Wrong OAuth scope | Re-grant `admin.directory.user.readonly` |
| Accounts not offboarded | Sync ran before new scope | Re-run sync after scope propagation (~5 min) |

---

## Audit Trail

Every sync attempt emits an audit log entry:
- **action:** `staff.sync.google_workspace`
- **resourceType:** `staff`
- **resourceId:** `all`
