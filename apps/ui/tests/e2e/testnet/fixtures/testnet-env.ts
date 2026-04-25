/**
 * Testnet environment configuration — loaded from process.env at test startup.
 * All secrets come from CI secrets or a local .env.testnet file (never committed).
 *
 * Variables required:
 *   BNB_TESTNET_RPC                — Chapel RPC endpoint
 *   SOL_DEVNET_RPC                 — Solana Devnet RPC endpoint
 *   DEPLOYER_PRIVATE_KEY_BNB       — 0x... hex private key for BNB test wallet
 *   DEPLOYER_KEYPAIR_SOL_BASE64    — base64-encoded Solana Keypair JSON
 *   SAFE_ADDRESS_BNB_TESTNET       — 0x... Safe multisig address on Chapel
 *   SQUADS_MULTISIG_PDA_DEVNET     — base58 Squads multisig PDA on Devnet
 *   USDT_BNB_ADDRESS               — 0x... tUSDT contract address on Chapel
 *   USDC_SOL_MINT                  — base58 tUSDC SPL mint on Devnet
 *   TREASURER_PRIVATE_KEY_BNB_0    — treasurer-0 private key (0x...)
 *   TREASURER_PRIVATE_KEY_BNB_1    — treasurer-1 private key (0x...)
 *   TREASURER_KEYPAIR_SOL_0_BASE64 — treasurer-0 Solana keypair
 *   TREASURER_KEYPAIR_SOL_1_BASE64 — treasurer-1 Solana keypair
 */

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val || val.trim() === '') {
    throw new Error(
      `[testnet-env] Required env var '${key}' is missing. ` +
        `Ensure .env.testnet is loaded or GitHub secret is set.`
    );
  }
  return val.trim();
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key]?.trim() || fallback;
}

export interface TestnetEnv {
  bnbRpc: string;
  solRpc: string;
  deployerPrivKeyBnb: string;
  deployerKeypairSolBase64: string;
  safeAddressBnb: string;
  squadsMultisigPdaDevnet: string;
  usdtBnbAddress: string;
  usdcSolMint: string;
  treasurerPrivKeyBnb0: string;
  treasurerPrivKeyBnb1: string;
  treasurerKeypairSol0Base64: string;
  treasurerKeypairSol1Base64: string;
  adminApiUrl: string;
  uiBaseUrl: string;
}

/** Load and validate all testnet env vars. Throws clearly on missing values. */
export function loadTestnetEnv(): TestnetEnv {
  return {
    bnbRpc: optionalEnv(
      'BNB_TESTNET_RPC',
      'https://data-seed-prebsc-1-s1.bnbchain.org:8545'
    ),
    solRpc: optionalEnv('SOL_DEVNET_RPC', 'https://api.devnet.solana.com'),
    deployerPrivKeyBnb: requireEnv('DEPLOYER_PRIVATE_KEY_BNB'),
    deployerKeypairSolBase64: requireEnv('DEPLOYER_KEYPAIR_SOL_BASE64'),
    safeAddressBnb: requireEnv('SAFE_ADDRESS_BNB_TESTNET'),
    squadsMultisigPdaDevnet: requireEnv('SQUADS_MULTISIG_PDA_DEVNET'),
    usdtBnbAddress: requireEnv('USDT_BNB_ADDRESS'),
    usdcSolMint: requireEnv('USDC_SOL_MINT'),
    treasurerPrivKeyBnb0: requireEnv('TREASURER_PRIVATE_KEY_BNB_0'),
    treasurerPrivKeyBnb1: requireEnv('TREASURER_PRIVATE_KEY_BNB_1'),
    treasurerKeypairSol0Base64: requireEnv('TREASURER_KEYPAIR_SOL_0_BASE64'),
    treasurerKeypairSol1Base64: requireEnv('TREASURER_KEYPAIR_SOL_1_BASE64'),
    adminApiUrl: optionalEnv('ADMIN_API_URL', 'http://localhost:3001'),
    uiBaseUrl: optionalEnv('UI_BASE_URL', 'http://localhost:5173'),
  };
}

/** Validate a BNB address (EIP-55 or lowercase 0x-prefixed). */
export function isValidBnbAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

/** Validate a base58 Solana address (rough check: 32-44 alphanumeric chars, no 0/O/I/l). */
export function isValidSolAddress(addr: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
}
