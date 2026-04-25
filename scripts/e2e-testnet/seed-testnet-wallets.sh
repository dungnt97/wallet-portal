#!/usr/bin/env bash
# seed-testnet-wallets.sh
#
# One-time setup: fund testnet wallets and verify they are ready for the e2e suite.
# Run this locally before the first testnet e2e run, and after any key rotation.
#
# Prerequisites:
#   - .env.testnet exists (copy from apps/ui/.env.testnet.example, fill in values)
#   - `cast` installed: https://book.getfoundry.sh/getting-started/installation
#   - `solana` CLI installed: https://docs.solana.com/cli/install-solana-cli-tools
#   - `pnpm` installed
#   - BNB deployer wallet manually funded via https://testnet.bnbchain.org/faucet-smart
#     (automated faucet requires a Twitter account; do once per 24h)
#
# Usage:
#   chmod +x scripts/e2e-testnet/seed-testnet-wallets.sh
#   ./scripts/e2e-testnet/seed-testnet-wallets.sh
#
# What it does:
#   1. Loads .env.testnet
#   2. Checks BNB deployer balance (warns if < 0.05 tBNB)
#   3. Airdrops SOL to Solana deployer if < 0.5 SOL
#   4. Verifies Safe and Squads are deployed
#   5. Runs infra/chain e2e-testnet-verify script as final sanity check

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$REPO_ROOT/apps/ui/.env.testnet"

# ── Load env ──────────────────────────────────────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found."
  echo "  Copy apps/ui/.env.testnet.example → apps/ui/.env.testnet and fill in values."
  exit 1
fi

# shellcheck disable=SC1090
set -a && source "$ENV_FILE" && set +a

: "${BNB_TESTNET_RPC:=https://data-seed-prebsc-1-s1.bnbchain.org:8545}"
: "${SOL_DEVNET_RPC:=https://api.devnet.solana.com}"

echo ""
echo "=== E2E Testnet Wallet Seeding ==="
echo "  BNB RPC:  $BNB_TESTNET_RPC"
echo "  SOL RPC:  $SOL_DEVNET_RPC"
echo ""

# ── 1. Check cast is available ────────────────────────────────────────────────
if ! command -v cast &>/dev/null; then
  echo "WARNING: 'cast' not found. Install Foundry: https://book.getfoundry.sh"
  echo "  Skipping BNB balance check."
else
  # Derive deployer address from private key
  DEPLOYER_ADDR=$(cast wallet address "$DEPLOYER_PRIVATE_KEY_BNB" 2>/dev/null || echo "")
  if [[ -n "$DEPLOYER_ADDR" ]]; then
    BNB_WEI=$(cast balance "$DEPLOYER_ADDR" --rpc-url "$BNB_TESTNET_RPC" 2>/dev/null || echo "0")
    BNB_ETH=$(cast to-unit "$BNB_WEI" ether 2>/dev/null || echo "0")
    echo "[BNB] Deployer $DEPLOYER_ADDR balance: $BNB_ETH tBNB"

    # Minimum 0.05 tBNB to run the full suite (mint() costs ~0.001 tBNB per call)
    MIN_BNB="50000000000000000"  # 0.05 BNB in wei
    if (( $(echo "$BNB_WEI < $MIN_BNB" | bc -l 2>/dev/null || echo 1) )); then
      echo ""
      echo "  WARNING: BNB balance is low (< 0.05 tBNB)."
      echo "  Request testnet BNB at: https://testnet.bnbchain.org/faucet-smart"
      echo "  Or: https://faucet.quicknode.com/binance-smart-chain/bnb-testnet"
      echo ""
    fi
  fi
fi

# ── 2. Airdrop SOL to Solana deployer if balance is low ──────────────────────
if ! command -v solana &>/dev/null; then
  echo "WARNING: 'solana' CLI not found."
  echo "  Install: https://docs.solana.com/cli/install-solana-cli-tools"
  echo "  Skipping SOL airdrop check."
else
  # Write deployer keypair to a temp file for solana CLI
  TMPKEYPAIR=$(mktemp /tmp/sol-deployer-XXXXXX.json)
  # Decode base64 keypair to JSON array format solana CLI expects
  echo "$DEPLOYER_KEYPAIR_SOL_BASE64" | base64 -d > "$TMPKEYPAIR"
  trap 'rm -f "$TMPKEYPAIR"' EXIT

  SOL_PUBKEY=$(solana-keygen pubkey "$TMPKEYPAIR" 2>/dev/null || echo "")
  if [[ -n "$SOL_PUBKEY" ]]; then
    SOL_BAL=$(solana balance "$SOL_PUBKEY" --url "$SOL_DEVNET_RPC" 2>/dev/null | awk '{print $1}' || echo "0")
    echo "[SOL] Deployer $SOL_PUBKEY balance: $SOL_BAL SOL"

    # Airdrop if < 0.5 SOL
    if (( $(echo "$SOL_BAL < 0.5" | bc -l 2>/dev/null || echo 1) )); then
      echo "  Requesting 2 SOL airdrop..."
      solana airdrop 2 "$SOL_PUBKEY" --url "$SOL_DEVNET_RPC" 2>/dev/null || \
        echo "  WARNING: Airdrop may be rate-limited. Try again in ~24h."
      sleep 3
      NEW_BAL=$(solana balance "$SOL_PUBKEY" --url "$SOL_DEVNET_RPC" 2>/dev/null | awk '{print $1}' || echo "?")
      echo "  New balance: $NEW_BAL SOL"
    fi
  fi
fi

# ── 3. Verify Safe address is set ────────────────────────────────────────────
if [[ -z "${SAFE_ADDRESS_BNB_TESTNET:-}" ]]; then
  echo ""
  echo "ERROR: SAFE_ADDRESS_BNB_TESTNET is not set in .env.testnet"
  echo "  Run: cd infra/chain && pnpm deploy:safe-bnb-testnet"
  exit 1
fi
echo "[BNB] Safe multisig: $SAFE_ADDRESS_BNB_TESTNET"

# ── 4. Verify Squads PDA is set ───────────────────────────────────────────────
if [[ -z "${SQUADS_MULTISIG_PDA_DEVNET:-}" ]]; then
  echo ""
  echo "ERROR: SQUADS_MULTISIG_PDA_DEVNET is not set in .env.testnet"
  echo "  Run: cd infra/chain && pnpm deploy:squads-devnet"
  exit 1
fi
echo "[SOL] Squads multisig PDA: $SQUADS_MULTISIG_PDA_DEVNET"

# ── 5. Verify token addresses are set ────────────────────────────────────────
if [[ -z "${USDT_BNB_ADDRESS:-}" ]]; then
  echo ""
  echo "ERROR: USDT_BNB_ADDRESS is not set in .env.testnet"
  echo "  Run: cd infra/chain && pnpm deploy:tokens"
  exit 1
fi
echo "[BNB] tUSDT contract: $USDT_BNB_ADDRESS"

if [[ -z "${USDC_SOL_MINT:-}" ]]; then
  echo ""
  echo "ERROR: USDC_SOL_MINT is not set in .env.testnet"
  echo "  Run: cd infra/chain && pnpm deploy:tokens"
  exit 1
fi
echo "[SOL] tUSDC mint: $USDC_SOL_MINT"

# ── 6. Run infra chain verify script ─────────────────────────────────────────
echo ""
echo "Running infra/chain e2e-testnet-verify (BNB + SOL)..."
cd "$REPO_ROOT/infra/chain" && \
  BNB_TESTNET_RPC="$BNB_TESTNET_RPC" \
  SOLANA_DEVNET_RPC="$SOL_DEVNET_RPC" \
  pnpm tsx scripts/e2e-testnet-verify.ts --chain all 2>&1 || {
    echo ""
    echo "WARNING: infra verify script failed. Check Safe/Squads balance and treasury keys."
    echo "  This is non-fatal — tests may still pass if only minor balance issues."
  }

echo ""
echo "=== Seeding complete ==="
echo "  Run the e2e suite with:"
echo "    cd apps/ui && pnpm test:e2e:testnet"
echo ""
