import { type SigningSession, canonicalSolanaBytes } from '@wp/shared-types';
// signing-session-verifier.ts — cryptographic verification of SigningSession + signature.
// EVM:    ethers.verifyTypedData (EIP-712, Safe 1.4.1 SafeTx)
// Solana: nacl.sign.detached.verify (Ed25519 over canonical 97-byte message)
//
// Called on every submit-signature and withdrawal approve.
// Returns { ok: true } or { ok: false, reason: string } — never throws for
// expected failure modes (bad sig, mismatched signer). Throws only on internal errors.
import { verifyTypedData } from 'ethers';
import nacl from 'tweetnacl';

// ── Types ──────────────────────────────────────────────────────────────────────

export type VerifyResult = { ok: true } | { ok: false; reason: string };

// ── EVM SafeTx type definitions ────────────────────────────────────────────────
// Safe 1.4.1 EIP-712 type definitions — must match exactly what was signed.
const SAFE_TX_TYPES: Record<string, Array<{ name: string; type: string }>> = {
  SafeTx: [
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'data', type: 'bytes' },
    { name: 'operation', type: 'uint8' },
    { name: 'safeTxGas', type: 'uint256' },
    { name: 'baseGas', type: 'uint256' },
    { name: 'gasPrice', type: 'uint256' },
    { name: 'gasToken', type: 'address' },
    { name: 'refundReceiver', type: 'address' },
    { name: 'nonce', type: 'uint256' },
  ],
};

// ── Base58 decoder (no external dep — replicates shared-types helper) ──────────
// We duplicate it here so admin-api has no import-cycle risk with the helper fn.
function base58ToBytes(encoded: string): Uint8Array {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const alphabetMap = new Map<string, number>();
  for (let i = 0; i < ALPHABET.length; i++) {
    const ch = ALPHABET[i];
    if (ch !== undefined) alphabetMap.set(ch, i);
  }

  let value = 0n;
  for (const char of encoded) {
    const digit = alphabetMap.get(char);
    if (digit === undefined) throw new Error(`Invalid base58 char: ${char}`);
    value = value * 58n + BigInt(digit);
  }

  const result = new Uint8Array(32);
  let tmp = value;
  for (let i = 31; i >= 0 && tmp > 0n; i--) {
    result[i] = Number(tmp & 0xffn);
    tmp >>= 8n;
  }
  if (tmp !== 0n) throw new Error('base58 value exceeds 32 bytes');
  return result;
}

// ── EVM verifier ───────────────────────────────────────────────────────────────

function verifyEvm(
  session: import('@wp/shared-types').SigningSessionEvm,
  signatureHex: string,
  expectedSigner: string
): VerifyResult {
  try {
    const domain = {
      name: session.domain.name,
      version: session.domain.version,
      chainId: session.domain.chainId,
      verifyingContract: session.domain.verifyingContract as `0x${string}`,
    };

    // ethers.verifyTypedData recovers the signer address from the EIP-712 signature.
    const recovered = verifyTypedData(domain, SAFE_TX_TYPES, session.message, signatureHex);

    if (recovered.toLowerCase() !== expectedSigner.toLowerCase()) {
      return {
        ok: false,
        reason: `EVM signer mismatch: expected ${expectedSigner}, got ${recovered}`,
      };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `EVM verify error: ${msg}` };
  }
}

// ── Solana verifier ────────────────────────────────────────────────────────────

function verifySolana(
  session: import('@wp/shared-types').SigningSessionSolana,
  signatureBase64: string,
  expectedSignerBase58: string
): VerifyResult {
  try {
    const messageBytes = canonicalSolanaBytes(session);

    let signatureBytes: Uint8Array;
    try {
      signatureBytes = Uint8Array.from(Buffer.from(signatureBase64, 'base64'));
    } catch {
      return { ok: false, reason: 'Solana signature is not valid base64' };
    }

    if (signatureBytes.length !== 64) {
      return {
        ok: false,
        reason: `Solana signature length invalid: expected 64, got ${signatureBytes.length}`,
      };
    }

    let publicKeyBytes: Uint8Array;
    try {
      publicKeyBytes = base58ToBytes(expectedSignerBase58);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, reason: `Invalid Solana signer pubkey: ${msg}` };
    }

    // nacl.sign.detached.verify is constant-time — safe for production use.
    const valid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
    if (!valid) {
      return { ok: false, reason: 'Solana Ed25519 signature verification failed' };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `Solana verify error: ${msg}` };
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Verify a signing session cryptographically.
 *
 * @param session       — parsed and validated SigningSession (v:1 already enforced by zod)
 * @param signature     — hex string for EVM, base64 for Solana
 * @param expectedSigner — checksummed 0x address for EVM, base58 pubkey for Solana
 *
 * Returns { ok: true } on success.
 * Returns { ok: false, reason } on bad signature, signer mismatch, or tampered payload.
 * Never logs raw signature bytes; only logs signerAddress and result.
 */
export function verifySigningSession(
  session: SigningSession,
  signature: string,
  expectedSigner: string
): VerifyResult {
  if (session.kind === 'evm') {
    return verifyEvm(session, signature, expectedSigner);
  }
  if (session.kind === 'sol') {
    return verifySolana(session, signature, expectedSigner);
  }
  // TypeScript exhaustive check — unreachable at runtime if zod parsed correctly
  const _exhaustive: never = session;
  return {
    ok: false,
    reason: `Unknown session kind: ${String((_exhaustive as SigningSession).kind)}`,
  };
}
