import {
  SigningSession,
  type SigningSessionEvm,
  type SigningSessionSolana,
  canonicalSolanaBytes,
} from '@wp/shared-types';
// Unit tests for signing-session-verifier.ts
// Golden vectors are generated at test time using ethers Wallet and tweetnacl keypairs
// so they never drift from the canonical implementation.
import { Wallet } from 'ethers';
import nacl from 'tweetnacl';
import { describe, expect, it } from 'vitest';
import { verifySigningSession } from '../signing-session-verifier.js';

// ── EVM fixtures ──────────────────────────────────────────────────────────────

const evmWallet = new Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
// deterministic address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

function makeEvmSession(): SigningSessionEvm {
  return {
    v: 1,
    kind: 'evm',
    safeAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    chainId: 97,
    safeTxHash: `0x${'ab'.repeat(32)}`,
    domain: {
      name: 'Safe',
      version: '1.4.1',
      chainId: 97,
      verifyingContract: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    },
    message: {
      to: '0x1111111111111111111111111111111111111111',
      value: '0',
      data: `0xa9059cbb${'0'.repeat(56)}`,
      operation: 0,
      safeTxGas: '0',
      baseGas: '0',
      gasPrice: '0',
      gasToken: '0x0000000000000000000000000000000000000000',
      refundReceiver: '0x0000000000000000000000000000000000000000',
      nonce: '42',
    },
  };
}

async function signEvm(session: SigningSessionEvm): Promise<string> {
  const { domain, message } = session;
  const types = {
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
  return evmWallet.signTypedData(domain, types, message);
}

// ── Solana fixtures ────────────────────────────────────────────────────────────

// Fixed keypair for deterministic tests
const solKeypair = nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(0x42));

// base58-encode a 32-byte pubkey (re-implements encode for test fixtures)
function pubkeyToBase58(bytes: Uint8Array): string {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let value = 0n;
  for (const b of bytes) value = value * 256n + BigInt(b);

  let result = '';
  while (value > 0n) {
    const idx = Number(value % 58n);
    result = ALPHABET[idx] + result;
    value = value / 58n;
  }
  // leading zero bytes → '1'
  for (const b of bytes) {
    if (b !== 0) break;
    result = `1${result}`;
  }
  return result;
}

const SOL_SIGNER = pubkeyToBase58(solKeypair.publicKey);

// A destination pubkey distinct from signer
const destKeypair = nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(0x77));
const SOL_DESTINATION = pubkeyToBase58(destKeypair.publicKey);

// A multisig PDA pubkey
const pdaKeypair = nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(0x11));
const SOL_MULTISIG_PDA = pubkeyToBase58(pdaKeypair.publicKey);

function makeSolSession(overrides: Partial<SigningSessionSolana> = {}): SigningSessionSolana {
  return {
    v: 1,
    kind: 'sol',
    multisigPda: SOL_MULTISIG_PDA,
    opId: '550e8400-e29b-41d4-a716-446655440000',
    amount: '1000000',
    tokenTag: 'USDT',
    destination: SOL_DESTINATION,
    nonce: '7',
    ...overrides,
  };
}

function signSolana(session: SigningSessionSolana): string {
  const msgBytes = canonicalSolanaBytes(session);
  const sigBytes = nacl.sign.detached(msgBytes, solKeypair.secretKey);
  return Buffer.from(sigBytes).toString('base64');
}

// ── EVM tests ─────────────────────────────────────────────────────────────────

describe('verifySigningSession — EVM', () => {
  it('returns ok:true for a valid SafeTx signature', async () => {
    const session = makeEvmSession();
    const sig = await signEvm(session);
    const result = verifySigningSession(session, sig, evmWallet.address);
    expect(result.ok).toBe(true);
  });

  it('returns ok:false when signature was made by a different account', async () => {
    const wrongWallet = Wallet.createRandom();
    const session = makeEvmSession();
    const sig = await signEvm(session);
    // expectedSigner is wrongWallet, but sig was made by evmWallet
    const result = verifySigningSession(session, sig, wrongWallet.address);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; reason: string }).reason).toMatch(/mismatch/i);
  });

  it('returns ok:false when the message field is tampered', async () => {
    const session = makeEvmSession();
    const sig = await signEvm(session);
    // Tamper: change the nonce in the message AFTER signing
    const tampered: SigningSessionEvm = {
      ...session,
      message: { ...session.message, nonce: '999' },
    };
    const result = verifySigningSession(tampered, sig, evmWallet.address);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; reason: string }).reason).toMatch(/mismatch/i);
  });
});

// ── Solana tests ───────────────────────────────────────────────────────────────

describe('verifySigningSession — Solana', () => {
  it('returns ok:true for a valid Ed25519 signature over canonical bytes', () => {
    const session = makeSolSession();
    const sig = signSolana(session);
    const result = verifySigningSession(session, sig, SOL_SIGNER);
    expect(result.ok).toBe(true);
  });

  it('returns ok:true even when session object has different key ordering (canonical bytes are deterministic)', () => {
    // Construct a session object with manually shuffled field order by spreading in reverse
    const base = makeSolSession();
    // Object.assign forces a different internal property insertion order
    const shuffled: SigningSessionSolana = Object.assign({
      nonce: base.nonce,
      destination: base.destination,
      tokenTag: base.tokenTag,
      amount: base.amount,
      opId: base.opId,
      multisigPda: base.multisigPda,
      kind: base.kind,
      v: base.v,
    } as SigningSessionSolana);
    // Sign the original (same canonical bytes) — both must verify identically
    const sig = signSolana(base);
    const result = verifySigningSession(shuffled, sig, SOL_SIGNER);
    expect(result.ok).toBe(true);
  });

  it('returns ok:false when amount is tampered', () => {
    const session = makeSolSession();
    const sig = signSolana(session);
    const tampered = makeSolSession({ amount: '9999999' });
    const result = verifySigningSession(tampered, sig, SOL_SIGNER);
    expect(result.ok).toBe(false);
    expect((result as { ok: false; reason: string }).reason).toMatch(/failed/i);
  });

  it('returns ok:false when destination is tampered', () => {
    const session = makeSolSession();
    const sig = signSolana(session);
    const altDest = pubkeyToBase58(
      nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(0xaa)).publicKey
    );
    const tampered = makeSolSession({ destination: altDest });
    const result = verifySigningSession(tampered, sig, SOL_SIGNER);
    expect(result.ok).toBe(false);
  });

  it('returns ok:false for signature from a wrong keypair', () => {
    const wrongKeypair = nacl.sign.keyPair.fromSeed(new Uint8Array(32).fill(0x01));
    const session = makeSolSession();
    const sig = Buffer.from(
      nacl.sign.detached(canonicalSolanaBytes(session), wrongKeypair.secretKey)
    ).toString('base64');
    const result = verifySigningSession(session, sig, SOL_SIGNER);
    expect(result.ok).toBe(false);
  });
});

// ── Version guard tests ────────────────────────────────────────────────────────

describe('SigningSession v:1 version guard (zod schema)', () => {
  it('zod rejects missing v field', () => {
    const raw = {
      kind: 'sol',
      multisigPda: SOL_MULTISIG_PDA,
      opId: '550e8400-e29b-41d4-a716-446655440000',
      amount: '1000000',
      tokenTag: 'USDT',
      destination: SOL_DESTINATION,
      nonce: '7',
      // v field intentionally omitted
    };
    const result = SigningSession.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('zod rejects v:2', () => {
    const raw = {
      v: 2, // wrong version
      kind: 'sol',
      multisigPda: SOL_MULTISIG_PDA,
      opId: '550e8400-e29b-41d4-a716-446655440000',
      amount: '1000000',
      tokenTag: 'USDT',
      destination: SOL_DESTINATION,
      nonce: '7',
    };
    const result = SigningSession.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('zod rejects unknown kind', () => {
    const raw = {
      v: 1,
      kind: 'btc', // not in discriminated union
      address: 'bc1q...',
    };
    const result = SigningSession.safeParse(raw);
    expect(result.success).toBe(false);
  });
});
