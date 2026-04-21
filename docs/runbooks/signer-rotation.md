# Runbook: Signer Rotation

**Applies to:** Slice 6 signer ceremony system (add / remove / rotate-all)
**Chains:** BNB Chain (Gnosis Safe) + Solana (Squads v4)
**Audience:** On-call admin / treasury ops

---

## Preconditions

Before starting any signer ceremony:

1. **Target staff has signing keys registered** on BOTH chains.
   - Check: `GET /staff/:id` → verify `staffSigningKeys` includes `chain=bnb` and `chain=sol`, both with `revokedAt=null`.
   - If missing: direct the staff member to register their key via the key-onboarding flow (`POST /staff/signing-keys`).
2. **No active `partial` ceremony exists** on the affected chains.
   - Check: `GET /signers/ceremonies?status=partial`.
   - Resolve any partial state first (see section below).
3. **Threshold math is valid**: post-operation owner count ≥ 2 and ≥ threshold.
   - The UI shows a live `post: M-of-N` preview; the server also validates this.
4. **No in-flight withdrawals or sweeps** are in `executing` state on the same chain.
   - The `ceremony_gate` policy rule blocks approvals during executing/partial ceremonies, but confirm operationally before proceeding.

---

## Operation Types

### Add signer

**When to use:** Onboarding a new treasurer; expanding the multisig set.

1. Admin opens **Signers → Add signer**.
2. Select the staff member and provide a reason.
3. Confirm WebAuthn step-up → `POST /signers/add` fires.
4. A `signer_add` ceremony is created (status: `pending`).
5. Existing treasurers sign the multisig op on each chain (BNB Safe UI / Squads web UI).
6. When threshold is met per chain, wallet-engine broadcasts and confirms.
7. On both chains confirmed: the new staff member appears in the active signer set; their signing key `revokedAt` remains null.

**Validation:**
```sh
# Verify new signer is active on both chains
GET /signers/ceremonies/<id>   # status=confirmed
GET /staff/<targetStaffId>      # role=treasurer (after key-flip)
```

---

### Remove signer

**When to use:** Offboarding a treasurer; revoking a compromised key.

1. Admin opens **Signers → Remove signer**.
2. Select the treasurer to remove. The UI blocks submission if removal would drop below threshold.
3. Confirm step-up → `POST /signers/remove`.
4. Ceremony created. Remaining treasurers sign.
5. On both chains confirmed: the removed staff member's signing keys are soft-deleted (`revokedAt=now()`).

**Threshold preservation:**
- System enforces `post-remove count ≥ 2`.
- If you need to remove and the set is already at 2, add a replacement first.

---

### Rotate all (replace owners atomically)

**When to use:** Quarterly key rotation; bulk re-keying after security event.

1. Admin opens **Signers → Rotate all**.
2. Select staff to **add** (left column) and staff to **remove** (right column).
3. Review `post: M-of-N` preview — must remain ≥ 2.
4. Confirm step-up → `POST /signers/rotate`.
5. Single ceremony, one multisig op per chain with all add+remove actions batched.
6. On both chains confirmed: old keys revoked, new keys activated atomically.

---

## Handling Partial Completion

`status=partial` means one chain confirmed and the other failed after retry exhaustion. The UI shows a red banner and links here.

**This is the most critical failure state.** Withdrawals on the affected chain are blocked by the `ceremony_gate` rule until resolved.

### Identify which chain failed

```sh
GET /signers/ceremonies/<id>
# chainStates.bnb.status   → confirmed | failed
# chainStates.solana.status → confirmed | failed
```

### Option A: Retry the failed chain (preferred)

1. Admin navigates to the ceremony in the UI → **Retry chain** button (visible when `status=partial`).
2. This re-enqueues the wallet-engine job for the failed chain.
3. Monitor ceremony status until both chains show `confirmed`.

If the button is unavailable (no wallet-engine connectivity), enqueue manually:

```sh
# Via BullMQ dashboard or Redis CLI
# jobId format: ceremony:<id>:<chain>
# Add to queue: signer_ceremony
# Payload: { ceremonyId: "<id>", chain: "bnb" | "sol" }
```

### Option B: Manual recovery — BNB Safe (Gnosis Safe UI)

1. Go to https://app.safe.global (or BNB testnet equivalent).
2. Connect as an existing owner.
3. Locate the pending Safe transaction from the ceremony (by nonce or description).
4. If the transaction is still in queue: gather remaining owner approvals and execute.
5. If the transaction expired: create a new Safe transaction manually using the same parameters (add/remove owner address + threshold unchanged).
6. After on-chain confirmation: update the ceremony chain state in the DB:

```sql
UPDATE signer_ceremonies
SET chain_states = jsonb_set(
  chain_states,
  '{bnb,status}',
  '"confirmed"'::jsonb
),
status = CASE
  WHEN chain_states->'solana'->>'status' = 'confirmed' THEN 'confirmed'
  ELSE 'partial'
END,
updated_at = now()
WHERE id = '<ceremony-id>';
```

Also soft-revoke old keys / activate new keys if ceremony was rotate/remove:

```sql
-- Revoke removed signer's keys (for remove/rotate ceremonies)
UPDATE staff_signing_keys
SET revoked_at = now()
WHERE staff_id = '<removed-staff-id>'
  AND revoked_at IS NULL;
```

### Option C: Manual recovery — Solana Squads (Squads Web UI / CLI)

1. Go to https://v4.squads.so (or devnet equivalent).
2. Locate the pending config transaction for the ceremony vault.
3. Gather approvals from existing members and execute.
4. After confirmation, update DB as in Option B above (for `solana` chain state).

**Squads CLI fallback:**

```sh
# Install: npm i -g @sqds/multisig
# List pending config transactions
squads config-tx list --rpc <RPC_URL> --multisig <MULTISIG_ADDRESS>

# Execute a ready transaction
squads config-tx execute \
  --rpc <RPC_URL> \
  --multisig <MULTISIG_ADDRESS> \
  --tx-index <TX_INDEX> \
  --keypair ~/.config/solana/treasury-admin.json
```

---

## Force-Abandon a Ceremony (Last Resort)

Use only when: both chains have failed irreversibly and the system state is consistent (no partial on-chain execution occurred).

```sql
-- Mark ceremony abandoned (maps to 'cancelled' for UI purposes)
UPDATE signer_ceremonies
SET status = 'cancelled',
    chain_states = jsonb_set(
      jsonb_set(chain_states, '{bnb,status}', '"cancelled"'::jsonb),
      '{solana,status}', '"cancelled"'::jsonb
    ),
    updated_at = now()
WHERE id = '<ceremony-id>'
  AND status IN ('partial', 'in_progress', 'pending');

-- Also expire the linked multisig ops
UPDATE multisig_operations
SET status = 'expired', updated_at = now()
WHERE id IN (
  SELECT (chain_states->'bnb'->>'multisigOpId')::uuid FROM signer_ceremonies WHERE id = '<ceremony-id>'
  UNION
  SELECT (chain_states->'solana'->>'multisigOpId')::uuid FROM signer_ceremonies WHERE id = '<ceremony-id>'
);
```

After force-abandon, verify the on-chain state directly (Safe + Squads) to confirm no stale transactions remain. Start a fresh ceremony from the UI.

---

## Verification Checklist

After any ceremony completes:

- [ ] `GET /signers/ceremonies/<id>` returns `status=confirmed`
- [ ] Both `chainStates.bnb.status` and `chainStates.solana.status` are `confirmed`
- [ ] Both `chainStates.bnb.txHash` and `chainStates.solana.txHash` are populated
- [ ] For remove/rotate: removed staff's `staff_signing_keys.revoked_at` is non-null
- [ ] For add/rotate: added staff's `staff_signing_keys.revoked_at` is null
- [ ] Policy engine accepts approval from new signer: submit a test withdrawal approval and confirm `authorized_signer` rule passes
- [ ] Policy engine rejects approval from removed signer (if applicable)
- [ ] No in-flight withdrawals broken: check `multisig_operations` for any stuck `collecting` ops that pre-date the ceremony
- [ ] Audit log entries present: `action=signer.ceremony.created` and `action=signer.ceremony.completed`

---

## On-Boot Reconciliation

The admin-api runs `ceremony-resume.service.ts` on every boot:

- Scans `signer_ceremonies WHERE status='in_progress'` and re-enqueues wallet-engine jobs.
- Scans `status='partial'` ceremonies older than 1 hour and sends a `critical` admin notification.

If the resume scan itself fails (logged as `[ceremony-resume] Ceremony resume scan failed`), re-trigger manually:

```sh
# Restart admin-api — resume runs again on next boot
pnpm --filter @wp/admin-api start
```

---

## Escalation

If manual recovery is not possible within 2 hours:

1. Escalate to Treasury Lead + Security team.
2. Keep `ceremony_gate` rule in place (blocks withdrawals on affected chain — this is intentional).
3. Document all manual DB changes in the audit trail (`INSERT INTO audit_logs ...`).
4. Do not attempt to disable the `ceremony_gate` rule without sign-off from Security.
