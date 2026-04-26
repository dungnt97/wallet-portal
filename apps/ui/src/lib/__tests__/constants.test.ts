// Tests for lib/constants.ts — chain/token registry, RBAC, breakpoints.
import { describe, expect, it } from 'vitest';
import { BREAKPOINTS, CHAINS, MULTISIG_POLICY, ROLES, TOKENS } from '../constants';

describe('CHAINS', () => {
  it('has bnb entry', () => {
    expect(CHAINS.bnb).toBeDefined();
  });

  it('has sol entry', () => {
    expect(CHAINS.sol).toBeDefined();
  });

  it('bnb has expected shape', () => {
    expect(CHAINS.bnb).toMatchObject({
      id: 'bnb',
      name: 'BNB Chain',
      short: 'BNB',
    });
  });

  it('sol has expected shape', () => {
    expect(CHAINS.sol).toMatchObject({
      id: 'sol',
      name: 'Solana',
      short: 'SOL',
    });
  });

  it('bnb has positive confirmations', () => {
    expect(CHAINS.bnb.confirmations).toBeGreaterThan(0);
  });

  it('sol has positive confirmations', () => {
    expect(CHAINS.sol.confirmations).toBeGreaterThan(0);
  });
});

describe('TOKENS', () => {
  it('has USDT entry', () => {
    expect(TOKENS.USDT).toBeDefined();
  });

  it('has USDC entry', () => {
    expect(TOKENS.USDC).toBeDefined();
  });

  it('USDT has 6 decimals', () => {
    expect(TOKENS.USDT.decimals).toBe(6);
  });

  it('USDC has 6 decimals', () => {
    expect(TOKENS.USDC.decimals).toBe(6);
  });

  it('USDT symbol matches key', () => {
    expect(TOKENS.USDT.symbol).toBe('USDT');
  });

  it('USDC symbol matches key', () => {
    expect(TOKENS.USDC.symbol).toBe('USDC');
  });
});

describe('ROLES', () => {
  it('has admin, treasurer, operator, viewer', () => {
    expect(ROLES.admin).toBeDefined();
    expect(ROLES.treasurer).toBeDefined();
    expect(ROLES.operator).toBeDefined();
    expect(ROLES.viewer).toBeDefined();
  });

  it('each role id matches its key', () => {
    for (const [key, role] of Object.entries(ROLES)) {
      expect(role.id).toBe(key);
    }
  });

  it('each role has a non-empty label', () => {
    for (const role of Object.values(ROLES)) {
      expect(role.label.length).toBeGreaterThan(0);
    }
  });

  it('each role has a non-empty accent color', () => {
    for (const role of Object.values(ROLES)) {
      expect(role.accent.length).toBeGreaterThan(0);
    }
  });
});

describe('MULTISIG_POLICY', () => {
  it('required is 2', () => {
    expect(MULTISIG_POLICY.required).toBe(2);
  });

  it('total is 3', () => {
    expect(MULTISIG_POLICY.total).toBe(3);
  });

  it('required is less than total', () => {
    expect(MULTISIG_POLICY.required).toBeLessThan(MULTISIG_POLICY.total);
  });
});

describe('BREAKPOINTS', () => {
  it('xs is 720', () => {
    expect(BREAKPOINTS.xs).toBe(720);
  });

  it('sm is 1100', () => {
    expect(BREAKPOINTS.sm).toBe(1100);
  });

  it('md is 1400', () => {
    expect(BREAKPOINTS.md).toBe(1400);
  });

  it('breakpoints are in ascending order', () => {
    expect(BREAKPOINTS.xs).toBeLessThan(BREAKPOINTS.sm);
    expect(BREAKPOINTS.sm).toBeLessThan(BREAKPOINTS.md);
  });
});
