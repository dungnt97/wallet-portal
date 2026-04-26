/**
 * On-chain client helpers for real testnet interactions.
 *
 * BNB (Chapel): uses ethers v6 JsonRpcProvider + Wallet
 * Solana (Devnet): uses @solana/web3.js Connection + Keypair
 *
 * All functions implement exponential backoff for RPC rate limits.
 * No mocking — all calls go to real testnet RPCs.
 */
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
  Contract,
  JsonRpcProvider,
  type TransactionReceipt,
  Wallet,
  formatUnits,
  parseUnits,
} from 'ethers';

// Minimal ERC-20 ABI — only what the tests need
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function mint(address to, uint256 amount)',
  'function decimals() view returns (uint8)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
];

// ── Retry helpers ─────────────────────────────────────────────────────────────

/** Exponential backoff retry — doubles delay up to maxDelayMs. */
async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxAttempts = 5,
  baseDelayMs = 200,
  maxDelayMs = 5_000
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts) break;
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      console.warn(
        `[testnet-chain] ${label} attempt ${attempt}/${maxAttempts} failed. Retrying in ${delay}ms.`,
        (err as Error).message
      );
      await sleep(delay);
    }
  }
  throw new Error(
    `[testnet-chain] ${label} failed after ${maxAttempts} attempts: ${(lastErr as Error).message}`
  );
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── BNB helpers ───────────────────────────────────────────────────────────────

export interface BnbClientConfig {
  rpcUrl: string;
  privateKey: string; // 0x-prefixed hex
}

export interface BnbDepositResult {
  txHash: string;
  blockNumber: number;
  amountWei: bigint;
}

/** Create an ethers provider + signer pair for Chapel testnet. */
export function makeBnbClient(config: BnbClientConfig): {
  provider: JsonRpcProvider;
  wallet: Wallet;
} {
  const provider = new JsonRpcProvider(config.rpcUrl);
  const wallet = new Wallet(config.privateKey, provider);
  return { provider, wallet };
}

/**
 * Mint tUSDT/tUSDC tokens directly to a deposit address.
 * Uses the mint() function which is only available on our test token contracts.
 *
 * Returns the tx hash immediately after broadcast — call waitForBnbConfirmation()
 * separately to avoid blocking the test on-chain-side setup.
 */
export async function mintBnbTestToken(
  wallet: Wallet,
  tokenAddress: string,
  toAddress: string,
  amountHuman: string, // e.g. '100' for 100 tokens (18 decimals)
  decimals = 18
): Promise<string> {
  const contract = new Contract(tokenAddress, ERC20_ABI, wallet);
  const amount = parseUnits(amountHuman, decimals);
  return withRetry(async () => {
    // biome-ignore lint/suspicious/noExplicitAny: ethers Contract dynamic method — no static type for mint
    const tx = await (contract as any).mint(toAddress, amount);
    console.log(`[bnb-mint] tx=${tx.hash} to=${toAddress} amount=${amountHuman}`);
    return tx.hash as string;
  }, `mintBnbTestToken(${tokenAddress} → ${toAddress})`);
}

/**
 * Transfer tUSDT/tUSDC from signer wallet to a deposit address.
 * Use this when the deployer already holds tokens (vs minting fresh).
 */
export async function transferBnbToken(
  wallet: Wallet,
  tokenAddress: string,
  toAddress: string,
  amountHuman: string,
  decimals = 18
): Promise<string> {
  const contract = new Contract(tokenAddress, ERC20_ABI, wallet);
  const amount = parseUnits(amountHuman, decimals);
  return withRetry(async () => {
    // biome-ignore lint/suspicious/noExplicitAny: ethers Contract dynamic method — no static type for transfer
    const tx = await (contract as any).transfer(toAddress, amount);
    console.log(`[bnb-transfer] tx=${tx.hash} to=${toAddress} amount=${amountHuman}`);
    return tx.hash as string;
  }, `transferBnbToken(${tokenAddress} → ${toAddress})`);
}

/**
 * Poll for tx confirmation on BNB Chapel.
 * Waits until the receipt exists AND current block >= tx block + confirmDepth.
 */
export async function waitForBnbConfirmation(
  provider: JsonRpcProvider,
  txHash: string,
  confirmDepth = 3, // 3 blocks ≈ 9s on Chapel
  timeoutMs = 120_000
): Promise<TransactionReceipt> {
  const deadline = Date.now() + timeoutMs;
  let receipt: TransactionReceipt | null = null;

  while (Date.now() < deadline) {
    receipt = await provider.getTransactionReceipt(txHash);
    if (receipt) {
      const currentBlock = await provider.getBlockNumber();
      const confirmations = currentBlock - receipt.blockNumber;
      if (confirmations >= confirmDepth) {
        console.log(
          `[bnb-confirm] tx=${txHash} block=${receipt.blockNumber} confs=${confirmations}`
        );
        return receipt;
      }
      await sleep(2_000);
    } else {
      await sleep(3_000);
    }
  }
  throw new Error(`[waitForBnbConfirmation] Timeout after ${timeoutMs}ms waiting for tx=${txHash}`);
}

/** Read ERC-20 balance directly from chain — no caching. */
export async function getBnbTokenBalance(
  provider: JsonRpcProvider,
  tokenAddress: string,
  ownerAddress: string
): Promise<bigint> {
  const contract = new Contract(tokenAddress, ERC20_ABI, provider);
  return withRetry(async () => {
    // biome-ignore lint/suspicious/noExplicitAny: ethers Contract dynamic method — no static type for balanceOf
    const bal = await (contract as any).balanceOf(ownerAddress);
    return bal as bigint;
  }, `getBnbTokenBalance(${tokenAddress}, ${ownerAddress})`);
}

/** Format wei balance to human-readable string with given decimals. */
export function formatTokenAmount(wei: bigint, decimals = 18): string {
  return formatUnits(wei, decimals);
}

// ── Solana helpers ────────────────────────────────────────────────────────────

export interface SolClientConfig {
  rpcUrl: string;
  keypairBase64: string; // base64-encoded Uint8Array secret key
}

/** Decode a base64 Solana keypair. */
export function solKeypairFromBase64(base64: string): Keypair {
  const secretKey = Buffer.from(base64, 'base64');
  return Keypair.fromSecretKey(new Uint8Array(secretKey));
}

/** Create a Solana Connection for Devnet. */
export function makeSolConnection(rpcUrl: string): Connection {
  return new Connection(rpcUrl, 'confirmed');
}

/**
 * Transfer SPL tokens from signer to a recipient address.
 * Uses @solana/spl-token — dynamically imported to avoid compile-time issues.
 *
 * Returns the transaction signature.
 */
export async function transferSplToken(
  connection: Connection,
  signerKeypair: Keypair,
  mintAddress: string,
  toAddress: string,
  amountRaw: bigint // smallest unit (e.g. 6 decimals → 1_000_000 = 1 USDC)
): Promise<string> {
  const spl = await import('@solana/spl-token');
  const mint = new PublicKey(mintAddress);
  const dest = new PublicKey(toAddress);

  return withRetry(async () => {
    // Get or create source ATA
    const sourceAta = await spl.getOrCreateAssociatedTokenAccount(
      connection,
      signerKeypair,
      mint,
      signerKeypair.publicKey
    );
    // Get or create destination ATA
    const destAta = await spl.getOrCreateAssociatedTokenAccount(
      connection,
      signerKeypair,
      mint,
      dest
    );

    const sig = await spl.transfer(
      connection,
      signerKeypair,
      sourceAta.address,
      destAta.address,
      signerKeypair,
      amountRaw
    );
    console.log(`[sol-transfer] sig=${sig} to=${toAddress} amount=${amountRaw}`);
    return sig;
  }, `transferSplToken(${mintAddress} → ${toAddress})`);
}

/**
 * Airdrop SOL to an address if balance is below minLamports.
 * Devnet airdrop is rate-limited (~1 SOL/24h per address) — use sparingly.
 */
export async function airdropSolIfNeeded(
  connection: Connection,
  pubkey: PublicKey,
  minLamports = 0.05 * 1e9 // 0.05 SOL
): Promise<void> {
  const bal = await connection.getBalance(pubkey);
  if (bal >= minLamports) return;

  console.log(`[sol-airdrop] Balance ${bal} < ${minLamports}. Requesting 1 SOL airdrop...`);
  const sig = await withRetry(
    () => connection.requestAirdrop(pubkey, 1e9),
    `airdrop(${pubkey.toBase58()})`
  );
  const latestBlockhash = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature: sig, ...latestBlockhash }, 'confirmed');
  console.log(`[sol-airdrop] Done. sig=${sig}`);
}

/**
 * Mint SPL tokens directly to a recipient.
 * Only works if signerKeypair is the mint authority.
 */
export async function mintSplToken(
  connection: Connection,
  mintAuthority: Keypair,
  mintAddress: string,
  toAddress: string,
  amountRaw: bigint
): Promise<string> {
  const spl = await import('@solana/spl-token');
  const mint = new PublicKey(mintAddress);
  const dest = new PublicKey(toAddress);

  return withRetry(async () => {
    const destAta = await spl.getOrCreateAssociatedTokenAccount(
      connection,
      mintAuthority,
      mint,
      dest
    );
    const sig = await spl.mintTo(
      connection,
      mintAuthority,
      mint,
      destAta.address,
      mintAuthority,
      amountRaw
    );
    console.log(`[sol-mint] sig=${sig} to=${toAddress} amount=${amountRaw}`);
    return sig;
  }, `mintSplToken(${mintAddress} → ${toAddress})`);
}

/**
 * Wait for Solana transaction confirmation with timeout.
 * Solana finalizes in ~1-2s on devnet but can spike.
 */
export async function waitForSolConfirmation(
  connection: Connection,
  signature: string,
  timeoutMs = 60_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await connection.getSignatureStatus(signature);
    const conf = status?.value?.confirmationStatus;
    if (conf === 'confirmed' || conf === 'finalized') {
      console.log(`[sol-confirm] sig=${signature} status=${conf}`);
      return;
    }
    await sleep(1_000);
  }
  throw new Error(
    `[waitForSolConfirmation] Timeout after ${timeoutMs}ms waiting for sig=${signature}`
  );
}

/** Read SPL token balance for an owner address. */
export async function getSplTokenBalance(
  connection: Connection,
  mintAddress: string,
  ownerAddress: string
): Promise<bigint> {
  const spl = await import('@solana/spl-token');
  const mint = new PublicKey(mintAddress);
  const owner = new PublicKey(ownerAddress);
  return withRetry(async () => {
    const ata = spl.getAssociatedTokenAddressSync(mint, owner);
    try {
      const account = await spl.getAccount(connection, ata);
      return account.amount;
    } catch {
      return 0n; // Account doesn't exist yet = 0 balance
    }
  }, `getSplTokenBalance(${mintAddress}, ${ownerAddress})`);
}
