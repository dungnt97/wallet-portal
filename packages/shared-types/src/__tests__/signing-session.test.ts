import { describe, expect, it } from 'vitest';
import {
  SigningSession,
  SigningSessionEvm,
  SigningSessionSolana,
  canonicalSolanaBytes,
} from '../signing-session.js';

describe('SigningSessionEvm', () => {
  const validEvmSession = {
    v: 1,
    kind: 'evm' as const,
    safeAddress: '0x1234567890123456789012345678901234567890',
    chainId: 56,
    safeTxHash: '0x1234567890123456789012345678901234567890123456789012345678901234',
    domain: {
      name: 'Safe',
      version: '1.4.1',
      chainId: 56,
      verifyingContract: '0x1234567890123456789012345678901234567890',
    },
    message: {
      to: '0x0000000000000000000000000000000000000000',
      value: '0',
      data: '0x',
      operation: 0,
      safeTxGas: '0',
      baseGas: '0',
      gasPrice: '0',
      gasToken: '0x0000000000000000000000000000000000000000',
      refundReceiver: '0x0000000000000000000000000000000000000000',
      nonce: '0',
    },
  };

  it('parses valid EVM session', () => {
    const result = SigningSessionEvm.safeParse(validEvmSession);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe('evm');
      expect(result.data.v).toBe(1);
      expect(result.data.chainId).toBe(56);
    }
  });

  it('rejects invalid version', () => {
    const invalid = { ...validEvmSession, v: 2 };
    const result = SigningSessionEvm.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects invalid safe address (not 0x-prefixed hex)', () => {
    const invalid = {
      ...validEvmSession,
      safeAddress: 'not-an-address',
    };
    const result = SigningSessionEvm.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects safe address with invalid hex chars', () => {
    const invalid = {
      ...validEvmSession,
      safeAddress: '0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
    };
    const result = SigningSessionEvm.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects safe address that is too short', () => {
    const invalid = {
      ...validEvmSession,
      safeAddress: '0x12345678901234567890123456789012345678',
    };
    const result = SigningSessionEvm.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects invalid safeTxHash (not 64 hex chars)', () => {
    const invalid = {
      ...validEvmSession,
      safeTxHash: '0x1234',
    };
    const result = SigningSessionEvm.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects message.data without 0x prefix', () => {
    const invalid = {
      ...validEvmSession,
      message: { ...validEvmSession.message, data: 'abcd' },
    };
    const result = SigningSessionEvm.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects operation outside 0-1 range', () => {
    const invalid = {
      ...validEvmSession,
      message: { ...validEvmSession.message, operation: 2 },
    };
    const result = SigningSessionEvm.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('accepts operation 0 and 1', () => {
    const op0 = SigningSessionEvm.safeParse({
      ...validEvmSession,
      message: { ...validEvmSession.message, operation: 0 },
    });
    const op1 = SigningSessionEvm.safeParse({
      ...validEvmSession,
      message: { ...validEvmSession.message, operation: 1 },
    });
    expect(op0.success).toBe(true);
    expect(op1.success).toBe(true);
  });

  it('rejects invalid domain verifyingContract', () => {
    const invalid = {
      ...validEvmSession,
      domain: { ...validEvmSession.domain, verifyingContract: 'invalid' },
    };
    const result = SigningSessionEvm.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects non-positive chainId', () => {
    const invalid = {
      ...validEvmSession,
      domain: { ...validEvmSession.domain, chainId: 0 },
    };
    const result = SigningSessionEvm.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('SigningSessionSolana', () => {
  const validSolanaSession = {
    v: 1,
    kind: 'sol' as const,
    multisigPda: '11111111111111111111111111111111',
    opId: '550e8400-e29b-41d4-a716-446655440000',
    amount: '1000000',
    tokenTag: 'USDT' as const,
    destination: '11111111111111111111111111111111',
    nonce: '123456789',
  };

  it('parses valid Solana session', () => {
    const result = SigningSessionSolana.safeParse(validSolanaSession);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe('sol');
      expect(result.data.v).toBe(1);
      expect(result.data.tokenTag).toBe('USDT');
    }
  });

  it('rejects invalid version', () => {
    const invalid = { ...validSolanaSession, v: 2 };
    const result = SigningSessionSolana.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects multisigPda below 32 chars', () => {
    const invalid = {
      ...validSolanaSession,
      multisigPda: '1234567890123456789012345678901',
    };
    const result = SigningSessionSolana.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects multisigPda above 44 chars', () => {
    const invalid = {
      ...validSolanaSession,
      multisigPda: '111111111111111111111111111111111111111111111',
    };
    const result = SigningSessionSolana.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects invalid UUID format', () => {
    const invalid = {
      ...validSolanaSession,
      opId: 'not-a-uuid',
    };
    const result = SigningSessionSolana.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('accepts UUID with dashes in standard format', () => {
    const result = SigningSessionSolana.safeParse(validSolanaSession);
    expect(result.success).toBe(true);
  });

  it('rejects UUID without dashes (opId must be standard UUID format)', () => {
    const result = SigningSessionSolana.safeParse({
      ...validSolanaSession,
      opId: '550e8400e29b41d4a716446655440000',
    });
    expect(result.success).toBe(false);
  });

  it('rejects amount with non-digit chars', () => {
    const invalid = {
      ...validSolanaSession,
      amount: '1000000.5',
    };
    const result = SigningSessionSolana.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects amount with negative prefix', () => {
    const invalid = {
      ...validSolanaSession,
      amount: '-1000000',
    };
    const result = SigningSessionSolana.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('accepts amount 0', () => {
    const result = SigningSessionSolana.safeParse({
      ...validSolanaSession,
      amount: '0',
    });
    expect(result.success).toBe(true);
  });

  it('accepts all valid tokenTags', () => {
    const tags = ['SOL', 'USDT', 'USDC'] as const;
    for (const tag of tags) {
      const result = SigningSessionSolana.safeParse({
        ...validSolanaSession,
        tokenTag: tag,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid tokenTag', () => {
    const invalid = {
      ...validSolanaSession,
      tokenTag: 'DOGE',
    };
    const result = SigningSessionSolana.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects destination below 32 chars', () => {
    const invalid = {
      ...validSolanaSession,
      destination: '1234567890123456789012345678901',
    };
    const result = SigningSessionSolana.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('rejects nonce with non-digit chars', () => {
    const invalid = {
      ...validSolanaSession,
      nonce: '123456789.5',
    };
    const result = SigningSessionSolana.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('accepts nonce 0', () => {
    const result = SigningSessionSolana.safeParse({
      ...validSolanaSession,
      nonce: '0',
    });
    expect(result.success).toBe(true);
  });
});

describe('SigningSession discriminated union', () => {
  const validEvmSession = {
    v: 1,
    kind: 'evm' as const,
    safeAddress: '0x1234567890123456789012345678901234567890',
    chainId: 56,
    safeTxHash: '0x1234567890123456789012345678901234567890123456789012345678901234',
    domain: {
      name: 'Safe',
      version: '1.4.1',
      chainId: 56,
      verifyingContract: '0x1234567890123456789012345678901234567890',
    },
    message: {
      to: '0x0000000000000000000000000000000000000000',
      value: '0',
      data: '0x',
      operation: 0,
      safeTxGas: '0',
      baseGas: '0',
      gasPrice: '0',
      gasToken: '0x0000000000000000000000000000000000000000',
      refundReceiver: '0x0000000000000000000000000000000000000000',
      nonce: '0',
    },
  };

  const validSolanaSession = {
    v: 1,
    kind: 'sol' as const,
    multisigPda: '11111111111111111111111111111111',
    opId: '550e8400-e29b-41d4-a716-446655440000',
    amount: '1000000',
    tokenTag: 'USDT' as const,
    destination: '11111111111111111111111111111111',
    nonce: '123456789',
  };

  it('parses EVM variant', () => {
    const result = SigningSession.safeParse(validEvmSession);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe('evm');
    }
  });

  it('parses Solana variant', () => {
    const result = SigningSession.safeParse(validSolanaSession);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.kind).toBe('sol');
    }
  });

  it('rejects invalid kind discriminator', () => {
    const invalid = {
      v: 1,
      kind: 'invalid',
      // ... rest of fields
    };
    const result = SigningSession.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('canonicalSolanaBytes', () => {
  const validSession = {
    v: 1,
    kind: 'sol' as const,
    multisigPda: '11111111111111111111111111111111',
    opId: '550e8400-e29b-41d4-a716-446655440000',
    amount: '1000000',
    tokenTag: 'USDT' as const,
    destination: '11111111111111111111111111111111',
    nonce: '123456789',
  };

  it('produces 97-byte output', () => {
    const bytes = canonicalSolanaBytes(validSession);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(97);
  });

  it('produces deterministic output', () => {
    const bytes1 = canonicalSolanaBytes(validSession);
    const bytes2 = canonicalSolanaBytes(validSession);
    expect(bytes1).toEqual(bytes2);
  });

  it('domain tag is 32 bytes', () => {
    const bytes = canonicalSolanaBytes(validSession);
    const tagBytes = new TextEncoder().encode('wallet-portal-sign-v1');
    // First 32 bytes should contain the domain tag padded with zeros
    expect(bytes.slice(0, tagBytes.length)).toEqual(tagBytes);
    expect(bytes.slice(tagBytes.length, 32)).toEqual(new Uint8Array(32 - tagBytes.length));
  });

  it('opId is 16 bytes at offset 32-48', () => {
    const bytes = canonicalSolanaBytes(validSession);
    const opIdSection = bytes.slice(32, 48);
    expect(opIdSection.length).toBe(16);
  });

  it('amount is 8 bytes at offset 48-56', () => {
    const bytes = canonicalSolanaBytes(validSession);
    const amountSection = bytes.slice(48, 56);
    expect(amountSection.length).toBe(8);
  });

  it('token tag is 1 byte at offset 56', () => {
    const bytes = canonicalSolanaBytes(validSession);
    const tokenByte = bytes[56];
    // USDT = 1
    expect(tokenByte).toBe(1);
  });

  it('encodes USDT as 1', () => {
    const bytes = canonicalSolanaBytes(validSession);
    expect(bytes[56]).toBe(1);
  });

  it('encodes USDC as 2', () => {
    const bytes = canonicalSolanaBytes({
      ...validSession,
      tokenTag: 'USDC' as const,
    });
    expect(bytes[56]).toBe(2);
  });

  it('encodes SOL as 0', () => {
    const bytes = canonicalSolanaBytes({
      ...validSession,
      tokenTag: 'SOL' as const,
    });
    expect(bytes[56]).toBe(0);
  });

  it('destination is 32 bytes at offset 57-89', () => {
    const bytes = canonicalSolanaBytes(validSession);
    const destSection = bytes.slice(57, 89);
    expect(destSection.length).toBe(32);
  });

  it('nonce is 8 bytes at offset 89-97', () => {
    const bytes = canonicalSolanaBytes(validSession);
    const nonceSection = bytes.slice(89, 97);
    expect(nonceSection.length).toBe(8);
  });

  it('encodes UUID correctly', () => {
    const session = {
      ...validSession,
      opId: '00000000-0000-0000-0000-000000000000',
    };
    const bytes = canonicalSolanaBytes(session);
    const uuidSection = bytes.slice(32, 48);
    expect(uuidSection).toEqual(new Uint8Array(16));
  });

  it('throws on invalid UUID', () => {
    const invalid = {
      ...validSession,
      opId: 'invalid-uuid',
    };
    expect(() => canonicalSolanaBytes(invalid)).toThrow();
  });

  it('throws on invalid base58 destination', () => {
    const invalid = {
      ...validSession,
      destination: '0000000000000000000000000000000000',
    };
    expect(() => canonicalSolanaBytes(invalid)).toThrow();
  });

  it('encodes large amounts (u64 bounds)', () => {
    const maxU64 = '18446744073709551615';
    const bytes = canonicalSolanaBytes({
      ...validSession,
      amount: maxU64,
    });
    expect(bytes.length).toBe(97);
  });

  it('encodes zero amount', () => {
    const bytes = canonicalSolanaBytes({
      ...validSession,
      amount: '0',
    });
    const amountSection = bytes.slice(48, 56);
    expect(amountSection).toEqual(new Uint8Array(8));
  });

  it('handles large u64 amounts at max boundary', () => {
    const maxU64 = '18446744073709551615';
    const bytes = canonicalSolanaBytes({
      ...validSession,
      amount: maxU64,
    });
    expect(bytes.length).toBe(97);
  });

  it('different amounts produce different bytes', () => {
    const bytes1 = canonicalSolanaBytes(validSession);
    const bytes2 = canonicalSolanaBytes({
      ...validSession,
      amount: '2000000',
    });
    expect(bytes1).not.toEqual(bytes2);
  });

  it('different nonces produce different bytes', () => {
    const bytes1 = canonicalSolanaBytes(validSession);
    const bytes2 = canonicalSolanaBytes({
      ...validSession,
      nonce: '987654321',
    });
    expect(bytes1).not.toEqual(bytes2);
  });

  it('different opIds produce different bytes', () => {
    const bytes1 = canonicalSolanaBytes(validSession);
    const bytes2 = canonicalSolanaBytes({
      ...validSession,
      opId: '550e8400-e29b-41d4-a716-446655440001',
    });
    expect(bytes1).not.toEqual(bytes2);
  });
});
