# Key Rotation Runbook

**Scope:** All cryptographic secrets and key material used by wallet-portal.  
**On-call:** Admin + at least one Treasurer must be available.  
**Prerequisites:** Read the entire runbook before starting. Rotate one secret type at a time.

---

## 0. Pre-Rotation Checklist

- [ ] Enable the kill-switch first (POST /ops/kill-switch `{enabled:true, reason:"key rotation"}`)
  — this pauses all withdrawals + sweeps; deposits continue unaffected
- [ ] Confirm all in-flight jobs have drained or moved to `delayed` state (check GET /ops/health → queues.depth ≈ 0 active)
- [ ] Take a DB snapshot / point-in-time backup
- [ ] Ensure at least 2 staff members are online to approve step-up prompts
- [ ] Keep this runbook open in a separate tab — browser refreshes will require re-auth if JWT is rotated first

---

## 1. HD Master Seed (BNB + Solana deposit addresses)

**Impact:** All deposit addresses are derived from this seed. Rotating it means ALL user deposit addresses change.  
**Downtime:** Full deposit suspension required until chain watchers are re-synced.  
**Estimated time:** 2–4 hours.

### Steps

1. Enable kill-switch (see §0).
2. Stop all wallet-engine instances (`docker compose stop wallet-engine` or `kubectl scale deploy/wallet-engine --replicas=0`).
3. Generate new BIP39 mnemonic offline on an air-gapped machine:
   ```bash
   # On air-gapped machine only
   node -e "const m=require('bip39');console.log(m.generateMnemonic(256))"
   ```
4. Derive new xpub keys:
   ```bash
   # BNB (EVM, derivation path m/44'/60'/0')
   node scripts/derive-xpub.js --chain bnb --mnemonic "MNEMONIC"
   # Solana (derivation path m/44'/501'/0')
   node scripts/derive-xpub.js --chain sol --mnemonic "MNEMONIC"
   ```
5. Store the mnemonic in your HSM / secrets manager. Never write it to disk unencrypted.
6. Update environment secrets:
   - `HD_MASTER_XPUB_BNB` → new BNB xpub
   - `HD_MASTER_XPUB_SOL` → new Solana xpub
   - (If seed-derived): `HD_MASTER_SEED` → new mnemonic (only if wallet-engine reads seed directly)
7. Re-derive ALL user deposit addresses and update the `users.bnb_deposit_addr` / `users.sol_deposit_addr` columns:
   ```bash
   pnpm --filter @wp/wallet-engine ts-node scripts/rederive-all-addresses.ts
   ```
8. Update chain watcher checkpoint: reset `watcher_checkpoints` to the current block so old addresses are no longer watched.
9. Restart wallet-engine and verify deposit-confirm worker heartbeat appears in GET /ops/health.
10. Disable kill-switch (POST /ops/kill-switch `{enabled:false, reason:"key rotation complete"}`).
11. Send users a deposit-address-changed notification (out-of-band email/push).

### Rollback

- Restore original xpub envs and redeploy wallet-engine.
- Re-run address re-derivation with original xpubs.
- Kill-switch remains on until rollback verification complete.

### Verification

```bash
# Check a known user's derived address matches what's stored in DB
pnpm --filter @wp/wallet-engine ts-node scripts/verify-address.ts --userId <uuid>
```

---

## 2. JWT Access + Refresh Secrets

**Impact:** All active sessions invalidated on rotation. Staff must re-authenticate.  
**Downtime:** ~0 (tokens expire naturally; a brief overlap window is fine for access tokens).  
**Estimated time:** 5 minutes.

### Steps

1. Generate new secrets (32+ bytes of entropy each):
   ```bash
   openssl rand -hex 32   # JWT_ACCESS_SECRET
   openssl rand -hex 32   # JWT_REFRESH_SECRET
   ```
2. Update secrets manager (e.g. AWS Secrets Manager, Vault):
   - `JWT_ACCESS_SECRET`
   - `JWT_REFRESH_SECRET`
3. Trigger a rolling restart of admin-api:
   ```bash
   kubectl rollout restart deploy/admin-api
   # or
   docker compose up -d --no-deps admin-api
   ```
4. All active sessions will be invalidated immediately. Staff log in again.
5. Verify: `GET /healthz` returns 200 and staff can complete WebAuthn login.

### Rollback

Restore previous secrets and restart admin-api. Rolling restart is near-zero-downtime.

### Verification

```bash
curl -s https://<ADMIN_API>/healthz | jq .status
# Expected: "ok"
```

---

## 3. WebAuthn Credentials (Staff Hardware Keys)

**Impact:** Affects only the staff member whose key is being rotated.  
**Downtime:** None (per-user operation).  
**Estimated time:** 5 minutes per staff member.

### Steps

1. Staff member navigates to `/app/account/security`.
2. Clicks "Add security key" and registers new hardware key via WebAuthn ceremony.
3. Verifies the new key works by triggering a step-up action (e.g. a test withdrawal approval in a staging environment).
4. Clicks "Remove" next to the old key entry.
5. Admin confirms removal in audit log (GET /audit?action=webauthn.credential.removed).

### If staff member loses their key (emergency)

1. Admin uses POST /staff/:id/revoke-credentials (requires step-up from a second admin).
2. Staff member re-registers a new key using the out-of-band recovery flow (TOTP backup code).

### Verification

```sql
SELECT id, friendly_name, created_at FROM webauthn_credentials WHERE staff_id = '<uuid>';
-- Should show only the new credential after rotation
```

---

## 4. RPC API Keys (BNB / Solana node providers)

**Impact:** Chain probes fail; deposit confirmation stalls if primary RPC is unreachable.  
**Downtime:** None if fallback RPC is configured.  
**Estimated time:** 2 minutes.

### Steps

1. Provision new API key from RPC provider dashboard (QuickNode, Alchemy, Helius, etc.).
2. Update secrets:
   - `BNB_RPC_URL` / `RPC_BNB_PRIMARY` / `RPC_BNB_FALLBACK`
   - `SOL_RPC_URL` / `RPC_SOLANA_PRIMARY` / `RPC_SOLANA_FALLBACK`
3. Trigger rolling restart of wallet-engine (no kill-switch needed if fallback is active).
4. Revoke old API key in provider dashboard only after confirming new key is live.

### Verification

```bash
# BNB block number probe
curl -s -X POST $BNB_RPC_URL \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' \
  | jq .result

# Solana slot probe
curl -s -X POST $SOL_RPC_URL \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getSlot","params":[]}' \
  | jq .result
```

GET /ops/health → chains[*].status should return `"ok"` within 30s.

---

## 5. Safe Signer Keys (EVM multisig)

**Impact:** Affects BNB withdrawal signing. Requires updating Safe owners on-chain.  
**Downtime:** BNB withdrawals paused for the duration. Enable kill-switch.  
**Estimated time:** 1–2 hours (on-chain tx + confirmations).  
**Requires:** Threshold of existing Safe owners to co-sign the owner-swap tx.

### Steps

1. Enable kill-switch.
2. Generate new signer key:
   ```bash
   # Offline, air-gapped
   cast wallet new   # from foundry/cast
   ```
3. Initiate Safe owner swap: in the Safe UI (app.safe.global), submit "Swap owner" transaction with:
   - `prevOwner`: the Safe-linked address being rotated
   - `oldOwner`: current signer address
   - `newOwner`: new signer address
4. Collect threshold signatures from remaining Safe owners.
5. Broadcast the owner-swap transaction.
6. Wait for `CONFIRM_DEPTH_BNB` (12) block confirmations.
7. Update secrets:
   - `SAFE_SIGNER_PRIVATE_KEY` → new private key
   - Update `SAFE_ADDRESS` if a new Safe was deployed (rare; only if full redeployment)
8. Restart wallet-engine.
9. Verify: submit a test withdrawal (small amount, staging env) and confirm it reaches `confirmed` state.
10. Disable kill-switch.

### Rollback

If the new key is compromised before the swap tx is confirmed: do NOT broadcast. Discard the new key. Re-enable kill-switch and investigate.

### Verification

```bash
# Confirm new signer is an owner
cast call $SAFE_ADDRESS "getOwners()(address[])" --rpc-url $BNB_RPC_URL
```

---

## 6. Squads Signer Keys (Solana multisig)

**Impact:** Affects SOL withdrawal signing.  
**Downtime:** SOL withdrawals paused. Enable kill-switch.  
**Estimated time:** 1–2 hours.  
**Requires:** Threshold of existing Squads members.

### Steps

1. Enable kill-switch.
2. Generate new Solana keypair offline:
   ```bash
   solana-keygen new --no-bip39-passphrase --outfile /tmp/new-signer.json
   solana-keygen pubkey /tmp/new-signer.json
   ```
3. In Squads UI (v4): propose "Change Member" instruction with the new public key.
4. Collect threshold approvals from existing members.
5. Execute the proposal on-chain.
6. Update secrets:
   - `SQUADS_SIGNER_KEYPAIR` → base58-encoded new keypair
   - `SQUADS_MULTISIG_ADDRESS` if the multisig PDA changed (rare)
7. Move new keypair to secure secrets manager; delete the temp file securely (`shred -u /tmp/new-signer.json`).
8. Restart wallet-engine.
9. Verify: test SOL withdrawal completes `confirmed` state.
10. Disable kill-switch.

### Rollback

Same as §5: if new key is compromised before proposal execution, discard and don't execute. Re-investigate.

### Verification

```bash
# List current Squads members
# Replace with actual Squads SDK call or CLI
squads-cli members --multisig $SQUADS_MULTISIG_ADDRESS
```

---

## 7. Post-Rotation Verification Checklist

After completing any rotation:

- [ ] GET /ops/health returns all components `"ok"`
- [ ] Worker heartbeats visible (lastHeartbeatAgoSec < 30s for all 3 workers)
- [ ] Submit a test deposit → confirm it reaches `credited` state
- [ ] Submit a test withdrawal (staging) → confirm it reaches `confirmed` state
- [ ] Review audit log for unexpected entries during the rotation window
- [ ] Kill-switch is disabled (`enabled: false`)
- [ ] Rotate complete entry added to incident log with timestamp + operator names

---

## 8. Contact / Escalation

| Situation | Action |
|-----------|--------|
| Unexpected on-chain activity during rotation | Immediately re-enable kill-switch; page security on-call |
| DB backup restore needed | Page DBA on-call; do NOT proceed with rotation |
| Safe / Squads tx fails to get threshold | Page remaining signers; extend maintenance window |
| Any doubt about key material integrity | Abort rotation, keep kill-switch on, escalate to CTO |
