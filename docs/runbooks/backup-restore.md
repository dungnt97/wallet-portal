# Runbook: PostgreSQL Backup & Restore

## Overview

Wallet-portal uses `pg_dump` → S3 for point-in-time backups. Jobs are enqueued via
the admin UI (`Ops → Database Backups → Trigger backup now`) or directly via API.
The `pg-backup.worker` handles execution with concurrency 1 to prevent overlapping dumps.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string used by `pg_dump` |
| `BACKUP_S3_BUCKET` | No* | Target S3 bucket. **Absent = dry-run mode** |
| `BACKUP_S3_PREFIX` | No | Key prefix inside the bucket (default: `pg-backups/`) |
| `AWS_REGION` | No | AWS region for S3 client (default: `us-east-1`) |
| `AWS_ACCESS_KEY_ID` | Yes (prod) | IAM key with `s3:PutObject` on the bucket |
| `AWS_SECRET_ACCESS_KEY` | Yes (prod) | Corresponding secret |

*When `BACKUP_S3_BUCKET` is absent the worker runs in **dry-run mode**: it logs the
 `pg_dump` command that would execute but never writes to disk or S3. The backup row
 in the database is still created and marked `done` with `s3Key` prefixed `[dry-run]`.

---

## Dry-Run Mode

Dry-run is the default in local/staging when S3 is not configured. The Ops page shows
a yellow banner: _"Dry-run mode — BACKUP_S3_BUCKET not configured."_

To switch to real backups set `BACKUP_S3_BUCKET` and the AWS credentials above.

---

## Triggering a Backup

### Via UI

1. Navigate to **Ops → Database Backups**.
2. Click **Trigger backup now** (requires `ops.killswitch.toggle` permission).
3. A new row appears in the history table with status **Pending → Running → Done/Failed**.
4. The table auto-refreshes every 8 seconds.

### Via API

```bash
curl -X POST https://<admin-api>/ops/backup/pg-dump \
  -H "Cookie: session=<your-session-cookie>"
# → 202 {"backupId":"<uuid>","message":"Backup job enqueued","dryRun":false}
```

### Via queue (programmatic)

```typescript
await app.backupQueue.add('pg_backup', { backupId, triggeredBy }, { attempts: 1 });
```

---

## S3 Object Layout

```
s3://<BACKUP_S3_BUCKET>/<BACKUP_S3_PREFIX><ISO-timestamp>-<backupId>.dump
# e.g. pg-backups/2025-10-01T03:00:00.000Z-a1b2c3d4.dump
```

The dump is in PostgreSQL custom format (`-Fc`) which supports parallel restore.

---

## Restore Procedure

### Prerequisites

- `pg_restore` installed on the restore host (same major version as the dump)
- Postgres user with `CREATE DATABASE` or access to target DB
- AWS CLI or S3-compatible client to download the dump file

### Steps

1. **Download the dump from S3**

   ```bash
   aws s3 cp s3://<BACKUP_S3_BUCKET>/<key> ./restore.dump
   ```

   Find the S3 key in the **Ops → Database Backups** history table or query:

   ```sql
   SELECT s3_key, created_at FROM backups WHERE status = 'done' ORDER BY created_at DESC LIMIT 5;
   ```

2. **Create a target database** (skip if restoring in-place)

   ```bash
   createdb -U postgres wallet_restore
   ```

3. **Run pg_restore**

   ```bash
   pg_restore \
     --verbose \
     --no-owner \
     --no-acl \
     --jobs=4 \
     -d postgresql://postgres:<pass>@localhost:5432/wallet_restore \
     ./restore.dump
   ```

4. **Verify row counts**

   ```sql
   SELECT schemaname, tablename, n_live_tup
   FROM pg_stat_user_tables
   ORDER BY n_live_tup DESC;
   ```

5. **Smoke-test critical tables**

   ```sql
   SELECT COUNT(*) FROM users;
   SELECT COUNT(*) FROM withdrawals;
   SELECT COUNT(*) FROM ledger_entries;
   ```

6. **Redirect application** — update `DATABASE_URL` to point at the restored DB, or
   rename databases if restoring in-place.

---

## Failure Scenarios

| Symptom | Likely Cause | Fix |
|---|---|---|
| Row stays `pending` | Worker not running | Start admin-api (it launches the worker on boot) |
| Row `failed` — "pg_dump not found" | `pg_dump` binary missing from `PATH` | Install `postgresql-client` package |
| Row `failed` — S3 upload error | Invalid credentials or bucket | Verify `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `BACKUP_S3_BUCKET` |
| UI shows dry-run banner | `BACKUP_S3_BUCKET` unset | Set env var and restart admin-api |
| Restore fails `role does not exist` | Dump contains role references | Use `--no-owner --no-acl` flags (already in step 3 above) |

---

## Retention Policy

By default there is no automatic expiry. Configure an S3 lifecycle rule on the bucket:

```json
{
  "Rules": [{
    "Status": "Enabled",
    "Filter": { "Prefix": "pg-backups/" },
    "Expiration": { "Days": 30 }
  }]
}
```

Alternatively use Glacier transition rules for cost-effective long-term retention.

---

## Access Control

- **Trigger**: requires `ops.killswitch.toggle` permission (admin role only)
- **View history**: requires `ops.read` permission (admin + operator)
- **S3 bucket**: recommend bucket policy with `s3:PutObject` only (no `s3:DeleteObject`)
  to prevent accidental or malicious deletion of backups
- Rotate `AWS_ACCESS_KEY_ID` via the secrets-rotation runbook after any credential
  compromise incident

---

## Related

- `docs/runbooks/secrets-rotation.md` — rotate AWS credentials
- `apps/admin-api/src/workers/pg-backup.worker.ts` — worker implementation
- `apps/admin-api/src/routes/ops-backup.routes.ts` — API routes
