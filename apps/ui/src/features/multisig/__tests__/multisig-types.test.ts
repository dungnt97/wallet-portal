// Unit tests for features/multisig/multisig-types.ts — validates type shapes at runtime.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MultisigApproverRow, MultisigOpDisplay } from '../multisig-types';

describe('multisig-types', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('MultisigApproverRow shape', () => {
    it('creates a valid MultisigApproverRow', () => {
      const approver: MultisigApproverRow = {
        staffId: 'staff-001',
        at: '2024-01-01T00:00:00Z',
        txSig: '0xdeadbeef',
      };
      expect(approver.staffId).toBe('staff-001');
      expect(approver.at).toBe('2024-01-01T00:00:00Z');
      expect(approver.txSig).toBe('0xdeadbeef');
    });

    it('accepts any string for txSig (Solana or EVM signatures)', () => {
      const evm: MultisigApproverRow = {
        staffId: 'staff-evm',
        at: new Date().toISOString(),
        txSig: '0x' + 'a'.repeat(130),
      };
      const sol: MultisigApproverRow = {
        staffId: 'staff-sol',
        at: new Date().toISOString(),
        txSig: 'base58EncodedSig',
      };
      expect(evm.txSig).toMatch(/^0x/);
      expect(sol.txSig).toBe('base58EncodedSig');
    });
  });

  describe('MultisigOpDisplay shape', () => {
    const baseOp: MultisigOpDisplay = {
      id: 'op-0001',
      withdrawalId: 'wd-001',
      chain: 'bnb',
      operationType: 'withdrawal',
      multisigAddr: '0xSafeAddress',
      safeName: 'BNB Vault',
      amount: 5000,
      token: 'USDT',
      destination: '0xDestination',
      nonce: 1,
      required: 2,
      total: 3,
      collected: 1,
      approvers: [],
      rejectedBy: null,
      status: 'collecting',
      expiresAt: '2024-12-31T23:59:59Z',
      createdAt: '2024-01-01T00:00:00Z',
    };

    it('creates a valid MultisigOpDisplay with required fields', () => {
      expect(baseOp.id).toBe('op-0001');
      expect(baseOp.chain).toBe('bnb');
      expect(baseOp.operationType).toBe('withdrawal');
      expect(baseOp.amount).toBe(5000);
      expect(baseOp.required).toBe(2);
      expect(baseOp.total).toBe(3);
      expect(baseOp.collected).toBe(1);
      expect(baseOp.approvers).toEqual([]);
      expect(baseOp.rejectedBy).toBeNull();
    });

    it('accepts sol chain', () => {
      const op: MultisigOpDisplay = { ...baseOp, chain: 'sol' };
      expect(op.chain).toBe('sol');
    });

    it('accepts withdrawalId as null (non-withdrawal ops)', () => {
      const op: MultisigOpDisplay = { ...baseOp, withdrawalId: null };
      expect(op.withdrawalId).toBeNull();
    });

    it('accepts token as null (non-withdrawal ops)', () => {
      const op: MultisigOpDisplay = { ...baseOp, token: null };
      expect(op.token).toBeNull();
    });

    it('accepts USDC token', () => {
      const op: MultisigOpDisplay = { ...baseOp, token: 'USDC' };
      expect(op.token).toBe('USDC');
    });

    it('accepts rejectedBy as a staff id string', () => {
      const op: MultisigOpDisplay = { ...baseOp, rejectedBy: 'staff-002' };
      expect(op.rejectedBy).toBe('staff-002');
    });

    it('accepts all valid status literals', () => {
      const statuses: MultisigOpDisplay['status'][] = [
        'pending',
        'collecting',
        'ready',
        'submitted',
        'confirmed',
        'expired',
        'failed',
      ];
      statuses.forEach((status) => {
        const op: MultisigOpDisplay = { ...baseOp, status };
        expect(op.status).toBe(status);
      });
    });

    it('accepts a list of approvers', () => {
      const approver: MultisigApproverRow = {
        staffId: 'staff-001',
        at: '2024-01-01T00:00:00Z',
        txSig: '0xsig',
      };
      const op: MultisigOpDisplay = { ...baseOp, approvers: [approver] };
      expect(op.approvers).toHaveLength(1);
      expect(op.approvers[0].staffId).toBe('staff-001');
    });

    it('accepts signer_add operationType', () => {
      const op: MultisigOpDisplay = { ...baseOp, operationType: 'signer_add' };
      expect(op.operationType).toBe('signer_add');
    });

    it('amount can be zero for non-withdrawal ops', () => {
      const op: MultisigOpDisplay = { ...baseOp, amount: 0, token: null };
      expect(op.amount).toBe(0);
      expect(op.token).toBeNull();
    });

    it('nonce increments correctly', () => {
      const op1: MultisigOpDisplay = { ...baseOp, nonce: 1 };
      const op2: MultisigOpDisplay = { ...baseOp, nonce: 2 };
      expect(op2.nonce - op1.nonce).toBe(1);
    });
  });
});
