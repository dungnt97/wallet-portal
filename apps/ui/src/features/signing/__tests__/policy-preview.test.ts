import { describe, expect, it } from 'vitest';
import { evaluatePolicy } from '../policy-preview';
import type { SigningOp } from '../signing-flow-types';

const baseOp: SigningOp = {
  id: 'op-001',
  chain: 'bnb',
  token: 'USDT',
  amount: 10_000,
  destination: '0xDeadBeefDeadBeef1234567890AbCdEf00000001',
  signaturesRequired: 2,
  totalSigners: 3,
  destinationKnown: true,
};

describe('evaluatePolicy', () => {
  it('passes all checks for a standard low-value known-dest op', () => {
    const result = evaluatePolicy(baseOp);
    expect(result.passed).toBe(true);
    expect(result.checks.every((c) => c.ok)).toBe(true);
  });

  it('returns 4 checks', () => {
    const result = evaluatePolicy(baseOp);
    expect(result.checks).toHaveLength(4);
  });

  it('check keys are signer, whitelist, velocity, expiry', () => {
    const result = evaluatePolicy(baseOp);
    const keys = result.checks.map((c) => c.key);
    expect(keys).toContain('signer');
    expect(keys).toContain('whitelist');
    expect(keys).toContain('velocity');
    expect(keys).toContain('expiry');
  });

  it('fails velocity check when amount >= 250_000', () => {
    const result = evaluatePolicy({ ...baseOp, amount: 250_000 });
    const velocity = result.checks.find((c) => c.key === 'velocity');
    expect(velocity?.ok).toBe(false);
    expect(result.passed).toBe(false);
  });

  it('passes velocity check when amount < 250_000', () => {
    const result = evaluatePolicy({ ...baseOp, amount: 249_999 });
    const velocity = result.checks.find((c) => c.key === 'velocity');
    expect(velocity?.ok).toBe(true);
  });

  it('whitelist check has warning for unknown destination', () => {
    const result = evaluatePolicy({ ...baseOp, destinationKnown: false });
    const whitelist = result.checks.find((c) => c.key === 'whitelist');
    expect(whitelist?.warning).toBe(true);
    // Still ok=true (warning is not a hard fail)
    expect(whitelist?.ok).toBe(true);
  });

  it('whitelist check has no warning for known destination', () => {
    const result = evaluatePolicy({ ...baseOp, destinationKnown: true });
    const whitelist = result.checks.find((c) => c.key === 'whitelist');
    expect(whitelist?.warning).toBeFalsy();
    expect(whitelist?.ok).toBe(true);
  });

  it('signer check always passes', () => {
    const result = evaluatePolicy(baseOp);
    const signer = result.checks.find((c) => c.key === 'signer');
    expect(signer?.ok).toBe(true);
  });

  it('expiry check always passes', () => {
    const result = evaluatePolicy(baseOp);
    const expiry = result.checks.find((c) => c.key === 'expiry');
    expect(expiry?.ok).toBe(true);
  });

  it('overall passed = false when velocity fails', () => {
    const result = evaluatePolicy({ ...baseOp, amount: 500_000 });
    expect(result.passed).toBe(false);
  });

  it('velocity detail includes the formatted amount', () => {
    const result = evaluatePolicy({ ...baseOp, amount: 12_345 });
    const velocity = result.checks.find((c) => c.key === 'velocity');
    expect(velocity?.detail).toContain('12');
  });

  it('all checks have required shape: key, label, detail, ok', () => {
    const result = evaluatePolicy(baseOp);
    for (const check of result.checks) {
      expect(typeof check.key).toBe('string');
      expect(typeof check.label).toBe('string');
      expect(typeof check.detail).toBe('string');
      expect(typeof check.ok).toBe('boolean');
    }
  });
});
