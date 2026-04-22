# infra/chain — Multisig Deploy Scripts

One-shot scripts to deploy the treasury multisigs on testnets.
Do **not** run these against mainnet — they carry no mainnet config.

## Overview

| Script | Chain | Contract | Output |
|--------|-------|----------|--------|
| `deploy:safe-bnb-testnet` | BNB Chapel (chainId 97) | Safe v1.4.1 | `SAFE_ADDRESS_BNB_TESTNET` |
| `deploy:squads-devnet` | Solana Devnet | Squads v4 Multisig | `SQUADS_MULTISIG_PDA_DEVNET` |

Both scripts append results to `.deployed.json` (git-ignored — local record only).

---

## Prerequisites

### 1. Install dependencies

```bash
# From repo root
pnpm install

# Or just this package
pnpm --filter @wp/chain-scripts install
```

### 2. Configure environment

```bash
cd infra/chain
cp .env.example .env
# Edit .env — fill in keys and addresses before running anything
```

---

## Deploy Safe on BNB Chapel

### Get testnet BNB

Faucet: <https://testnet.bnbchain.org/faucet-smart>

Request at least **0.05 tBNB** for the deployer address. The Safe factory deploy
costs approximately 0.01–0.02 tBNB in gas.

### Configure `.env`

```dotenv
DEPLOYER_PRIVATE_KEY=0x<64-hex-chars>   # funded Chapel wallet
TREASURER_ADDRESSES=0xAddr1,0xAddr2,0xAddr3  # exactly 3, checksummed
```

### Run

```bash
pnpm --filter @wp/chain-scripts deploy:safe-bnb-testnet
```

### Expected output

```
=== Deploy Safe v1.4.1 — BNB Chapel testnet (chainId 97) ===
  RPC:      https://data-seed-prebsc-1-s1.bnbchain.org:8545
  Owners:   0xAddr1, 0xAddr2, 0xAddr3
  Threshold: 2 of 3
  Attempt 1/3 — deploying Safe...

SUCCESS — Safe deployed at: 0xSafe...
  Appended to .deployed.json: SAFE_ADDRESS_BNB_TESTNET=0xSafe...
```

### After deploy

Copy the Safe address to all three env files:

```bash
# apps/ui/.env
VITE_SAFE_ADDRESS_BNB_TESTNET=0xSafe...

# apps/admin-api/.env
SAFE_ADDRESS_BNB_TESTNET=0xSafe...

# apps/wallet-engine/.env
SAFE_ADDRESS_BNB_TESTNET=0xSafe...
```

---

## Deploy Squads Multisig on Solana Devnet

### Get devnet SOL

```bash
# Via CLI (requires solana CLI installed)
solana airdrop 2 <deployer-pubkey> --url devnet

# Or via web faucet
# https://faucet.solana.com  (select Devnet, paste address)
```

The script automatically requests a 2 SOL airdrop if the deployer balance is below
0.05 SOL — useful for CI or first-time setup.

### Generate a deployer keypair (if needed)

```bash
solana-keygen new -o ~/.config/solana/deployer-devnet.json
solana address -k ~/.config/solana/deployer-devnet.json   # prints pubkey
```

### Configure `.env`

```dotenv
DEPLOYER_KEYPAIR_PATH=~/.config/solana/deployer-devnet.json
TREASURER_PUBKEYS=PubKey1,PubKey2,PubKey3   # exactly 3, base58
```

### Run

```bash
pnpm --filter @wp/chain-scripts deploy:squads-devnet
```

### Expected output

```
=== Deploy Squads v4 Multisig — Solana Devnet ===
  RPC:       https://api.devnet.solana.com
  Members:   PubKey1, PubKey2, PubKey3
  Threshold: 2 of 3
  Deployer balance: 2.0000 SOL
  Creating multisig PDA...
  Transaction signature: 5xxx...

SUCCESS — Squads Multisig deployed
  Multisig PDA: <base58>
  Vault PDA:    <base58>
```

### After deploy

```bash
# apps/ui/.env
VITE_SQUADS_MULTISIG_PDA_DEVNET=<multisig-pda>

# apps/admin-api/.env
SQUADS_MULTISIG_PDA_DEVNET=<multisig-pda>

# apps/wallet-engine/.env
SQUADS_MULTISIG_PDA_DEVNET=<multisig-pda>
```

---

## After deploy — sync to apps

After any deploy script succeeds, run the sync helper to automatically propagate
the addresses from `.deployed.json` into each app's `.env.local`:

```bash
pnpm --filter @wp/chain-scripts sync-envs
```

This single command:
- Reads `infra/chain/.deployed.json`
- Writes/updates `apps/ui/.env.local` with `VITE_`-prefixed keys
- Writes/updates `apps/admin-api/.env.local` with bare key names
- Writes/updates `apps/wallet-engine/.env.local` with bare key names
- **Preserves** all unrelated keys already in each `.env.local`
- Is **idempotent** — re-running with unchanged `.deployed.json` produces no diff

Keys written by this command:

| `.deployed.json` key | `apps/ui` | `apps/admin-api` / `apps/wallet-engine` |
|---|---|---|
| `SQUADS_MULTISIG_PDA_DEVNET` | `VITE_SQUADS_MULTISIG_PDA_DEVNET` | `SQUADS_MULTISIG_PDA_DEVNET` |
| `SQUADS_VAULT_PDA_DEVNET` | `VITE_SQUADS_VAULT_PDA_DEVNET` | `SQUADS_VAULT_PDA_DEVNET` |

> All `.env.local` files are git-ignored. No secrets are committed.

---

## Deployed Address Registry

Successful deploys are recorded in `.deployed.json` (git-ignored).
Commit `.deployed.json.example` as a template reference if needed.

Schema:

```json
{
  "SAFE_ADDRESS_BNB_TESTNET": "0x...",
  "SQUADS_MULTISIG_PDA_DEVNET": "...",
  "SQUADS_VAULT_PDA_DEVNET": "...",
  "_updatedAt": "2026-04-21T00:00:00.000Z"
}
```

---

## Troubleshooting

### Safe deploy: `insufficient funds`

The deployer wallet needs tBNB on Chapel. Use the faucet link above.
The script retries up to 3 times on RPC failure with exponential back-off.

### Safe deploy: `contract already deployed` / nonce collision

Safe factory is deterministic — re-running with identical owners + threshold
returns the same address. This is safe (idempotent).

### Squads deploy: `Transaction simulation failed`

Usually insufficient SOL. The auto-airdrop covers the common case.
If on a congested RPC, try setting `SOLANA_DEVNET_RPC` to an alternative:
`https://devnet.helius-rpc.com/?api-key=<key>` (free tier available).

### Ledger Connect Kit requires Ledger Live desktop

The Ledger wallet path in the UI uses WalletConnect as transport.
Ledger Live must be running and the Ethereum/Solana apps open on the device.
In dev mode (`VITE_AUTH_DEV_MODE=true`) the mock adapter is used instead.

---

## Security notes

- `DEPLOYER_PRIVATE_KEY` grants full control of the deployer wallet — never commit it.
- `.env` and `.deployed.json` are git-ignored by `infra/chain/.gitignore`.
- Deployed multisigs on testnet have no real value — rotate keys before any mainnet use.
