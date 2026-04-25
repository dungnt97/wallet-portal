# Testnet USDT/USDC Token Acquisition Research

**Date:** 2026-04-25  
**Status:** Complete  
**Scope:** BSC Chapel testnet + Solana devnet stablecoin acquisition without deploying contracts

---

## Executive Summary

**EASIEST METHOD (BSC Chapel):**  
Official BNB Chain faucet at `https://www.bnbchain.org/en/testnet-faucet` directly distributes testnet USDT and USDC. No contract deployment needed. Limitation: 1 claim per 24 hours across all tokens.

**EASIEST METHOD (Solana devnet):**  
Circle's official faucet at `https://faucet.circle.com/` for USDC devnet (mint: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`). Same 2-hour rate limit per wallet, but works without contracts.

---

## BSC Chapel (BNB Testnet) Findings

### 1. Official Faucet Status ✓ WORKING

**URL:** https://www.bnbchain.org/en/testnet-faucet

**Tokens Available:** BTC, BUSD, DAI, ETH, USDC, XRP, USDT  
**USDT/USDC:** YES, both available  
**Claim Rate:** 1 request per 24 hours (across ALL tokens)  
**Process:** Visit faucet → select token → enter wallet → claim

**Status:** This is the official, maintained faucet. No contracts needed.

### 2. Contract Mint Functions (BOTH BLOCKED)

#### USDT at `0x337610d27c682e347c9cd60bd4b3b107c9d34ddd`
- **Mint function:** `function mint(uint256 amount) public onlyOwner returns (bool)`
- **Access:** `onlyOwner` modifier → **NOT publicly callable**
- **Decimals:** 18
- **Total Supply:** 100,000,000 USDT
- **Status:** Cannot use without owning the contract

#### USDC at `0x64544969ed7EBf5f083679233325356EbE738930`
- **Mint function:** `function mint(address to, uint256 amount) public {...}`
- **Access:** `onlyOwner` modifier → **NOT publicly callable**
- **Decimals:** 18
- **Total Supply:** 100,000,000 USDC
- **Status:** Cannot use without owning the contract

### 3. PancakeSwap Testnet Status ✓ PARTIALLY WORKING

**URL:** https://pancakeswap.finance/?chain=bscTestnet

**Capability:** Can swap tBNB ↔ USDT/USDC IF tokens already exist in liquidity pools

**Limitation:** Requires existing liquidity. If you have zero USDT/USDC to start with, this doesn't help unless:
1. You first get tokens from faucet OR
2. The pool has faucet-dispensed tokens seeded

**Testnet Router:** `0x9ac64cc6e4415144c455bd8e4837fea55603e5c3`

**Practical Use:** After getting initial tokens from faucet, PancakeSwap can help test swapping mechanics.

### 4. Alternative Third-Party Faucets

- **QuickNode:** https://faucet.quicknode.com/binance-smart-chain/bnb-testnet (tBNB only, not stablecoins)
- **Chainlink:** https://faucets.chain.link/bnb-chain-testnet (cross-chain test tokens)
- **Tatum:** https://tatum.io/faucets/bsc (various tokens)

**Note:** Most third-party faucets offer tBNB, not stablecoins directly. The official faucet is the primary source for USDT/USDC.

---

## Solana Devnet Findings

### 1. Circle Official Faucet ✓ WORKING

**URL:** https://faucet.circle.com/

**USDC Mint Address:** `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`  
**Amount:** Up to 5 USDC per claim  
**Rate Limit:** 2 hours per wallet address  
**Status:** Official, maintained, no contracts needed

**Process:**
1. Visit faucet.circle.com
2. Select Solana Devnet
3. Enter wallet address
4. Claim (wait 2 hours for next claim from same address)

### 2. spl-token CLI (Create Custom Test Tokens)

**Capability:** Can create and mint ANY custom SPL token on devnet without USDC  
**Why Useful:** If you need a stablecoin-like test token that isn't USDC

**CLI Commands:**
```bash
# Set to devnet
solana config set --url devnet

# Create token (18 decimals recommended for stablecoin-like behavior)
spl-token create-token --decimals 18

# Create token account
spl-token create-account <TOKEN_ADDRESS>

# Mint tokens (amount * 10^decimals)
spl-token mint <TOKEN_ADDRESS> 1000000000000000000  # 1 token with 18 decimals
```

**Requirements:** Must have devnet SOL in your wallet first (use Solana faucet: https://solfaucet.com/)

**Advantage:** No rate limits, unlimited minting once created  
**Disadvantage:** Not actual Circle USDC, just a test token

### 3. Alternative SPL Faucets

#### Credix SPL Token Faucet (Alternative USDC Mock)
**Mint:** `Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr`  
**Program:** `4sN8PnN2ki2W4TFXAfzR645FWs8nimmsYeNtxM8RBK6A`  
**URL:** https://spl-token-faucet.com/  
**Rate Limit:** Workaround for Circle's 5 USDC / 2-hour limit  
**Status:** Community-maintained, not official

#### Google's PYUSD Faucet
**URL:** https://cloud.google.com/application/web3/faucet/solana/devnet/pyusd  
**Amount:** 100 PYUSD daily  
**Status:** Official (Google/Solana Labs)  
**Limitation:** PYUSD, not USDC, but stablecoin-like

---

## Comparison Table

| Aspect | BSC Chapel | Solana Devnet |
|--------|-----------|---------------|
| **Official Stablecoin Faucet** | BNB Chain https://www.bnbchain.org/en/testnet-faucet | Circle https://faucet.circle.com/ |
| **Available Stablecoin** | USDT + USDC | USDC (5 max) |
| **Rate Limit** | 1 claim per 24h | 2h per address |
| **Contract Mint Access** | Both onlyOwner (blocked) | N/A (can create own SPL) |
| **DEX Swap Available** | PancakeSwap testnet (after faucet) | N/A (no stable DEX on devnet) |
| **Easiest Bootstrap** | Faucet claim | Faucet claim or spl-token CLI |

---

## Concrete Recommendations

### BSC Chapel (Tier 1 - Easiest)
1. **Go to:** https://www.bnbchain.org/en/testnet-faucet
2. **Claim:** USDT or USDC (pick one per 24h window)
3. **Wait:** Until claim processes
4. **Use:** Tokens appear in wallet
5. **Optional:** Swap more on PancakeSwap if needed

**Blocker:** One claim per 24 hours. If you need multiple tokens simultaneously, you must wait.

### Solana Devnet (Tier 1 - Easiest)
1. **Option A (Official):**
   - Go to: https://faucet.circle.com/
   - Claim: USDC (up to 5)
   - Wait: 2 hours for next claim
   
2. **Option B (Unlimited Custom Tokens):**
   - Get devnet SOL: https://solfaucet.com/
   - Run: `spl-token create-token --decimals 18`
   - Run: `spl-token mint <address> 1000000000000000000`
   - No rate limits, unlimited

### What DOES NOT Work (Without Deploying)

- **BSC USDT/USDC contract mint()** → Both onlyOwner protected
- **Creating USDC on BSC without contracts** → Not possible; existing contracts are immutable-owner
- **Swapping before getting initial tokens** → PancakeSwap needs liquidity seed

---

## Unresolved Questions

1. **BSC Faucet Rate Limit Workaround:** Is there a way to claim different tokens on different days within the 24h window, or is the limit truly global across all tokens? (Documentation unclear)

2. **PancakeSwap Liquidity on Chapel:** Which testnet pools are currently funded with real liquidity? (Need to check testnet explorer directly)

3. **Solana devnet spl-token:** Are there any existing "standard" test USDC-like tokens on devnet besides Circle's official mint? (Credix faucet exists but unclear if still maintained)

4. **BSC Faucet Token Amounts:** What are the exact claim amounts for USDT vs USDC on the official faucet? (Interface may vary)

---

## Sources

- [BNB Chain Official Testnet Faucet](https://www.bnbchain.org/en/testnet-faucet)
- [BSC Testnet USDT Contract (0x337610d27c682e347c9cd60bd4b3b107c9d34ddd)](https://testnet.bscscan.com/token/0x337610d27c682e347c9cd60bd4b3b107c9d34ddd)
- [BSC Testnet USDC Contract (0x64544969ed7EBf5f083679233325356EbE738930)](https://testnet.bscscan.com/token/0x64544969ed7EBf5f083679233325356EbE738930)
- [PancakeSwap Testnet](https://pancakeswap.finance/?chain=bscTestnet)
- [Circle USDC Faucet for Solana](https://faucet.circle.com/)
- [Solana Devnet USDC Mint Details](https://developers.circle.com/stablecoins/quickstart-transfer-10-usdc-on-solana)
- [Solana spl-token CLI Documentation](https://spl.solana.com/token)
- [Credix SPL Token Faucet](https://github.com/credix-finance/spl-token-faucet)
- [Solana Devnet Faucet (SOL)](https://solfaucet.com/)
