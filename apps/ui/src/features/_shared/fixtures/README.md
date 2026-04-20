# `features/_shared/fixtures/`

Canonical location for every prototype fixture used by the UI.

## Rule

**One domain per file.** Filename mirrors the feature it primarily serves. Add new fixtures here; do not scatter them into feature folders.

## Files

| File | Exports |
|---|---|
| `alerts.ts` | `ALERTS` |
| `audit.ts` | `AUDIT_LOG`, `FIXTURE_LOGIN_HISTORY`, `AuditEntry`, `LoginEvent`, `Severity` |
| `cold.ts` | `COLD_WALLETS`, `HOT_WALLETS`, `REBALANCE_HISTORY`, `ColdWallet`, `HotWallet`, `RebalanceOp` |
| `deposits.ts` | `FIX_DEPOSITS`, `FIX_DEPOSIT_ADDRESSES`, `TOTAL_BALANCES`, `FixDeposit`, `FixSweepAddr` |
| `multisig.ts` | `FIX_MULTISIG_OPS` |
| `random.ts` | `mul32`, `pickWith`, `evmAddr`, `solAddr`, `evmHash`, `solSig` — deterministic PRNG helpers |
| `signers.ts` | `ACTIVE_SIGNERS`, `RETIRED_SIGNERS`, `SIGNER_CHANGE_REQUESTS`, `SignerRow`, `RetiredSigner`, `SignerChangeRequest`, `ChangeKind`, `ChangeStatus` |
| `staff.ts` | `TREASURERS`, `STAFF_DIRECTORY`, `ROLE_DESCRIPTIONS`, `StaffRow` |
| `transactions.ts` | `FIX_TRANSACTIONS`, `FIX_TRANSACTIONS_FULL`, `FixTransaction`, `TxStatus`, `TxType` |
| `users.ts` | `FIX_USERS`, `ENRICHED_USERS`, `FixUser`, `EnrichedUser` |
| `withdrawals.ts` | `FIX_WITHDRAWALS`, `FixWithdrawal` |

## Import

Always import from the barrel:

```ts
import { FIX_USERS, TREASURERS, FIX_WITHDRAWALS } from '@/features/_shared/fixtures';
```

## Determinism

All random fields are generated via `mul32(seed)` from `random.ts`. Each file owns a unique seed so editing one domain does not perturb others.

## Adding a new domain

1. Create `{domain}.ts` in this folder.
2. Seed its PRNG with a literal not used elsewhere.
3. Export types + data.
4. Add the file to `index.ts` via `export *`.
5. Update the table above.
