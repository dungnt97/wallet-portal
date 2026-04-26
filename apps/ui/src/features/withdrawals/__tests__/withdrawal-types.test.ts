// Unit tests for features/withdrawals/withdrawal-types.ts — validates type shapes at runtime.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  WithdrawalApprover,
  WithdrawalMultisig,
  WithdrawalRow,
  WithdrawalStage,
} from '../withdrawal-types';

describe('withdrawal-types', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('WithdrawalStage values', () => {
    it('accepts all defined stage literals', () => {
      const stages: WithdrawalStage[] = [
        'draft',
        'awaiting_signatures',
        'executing',
        'completed',
        'failed',
        'time_locked',
        'broadcast',
        'cancelling',
        'cancelled',
      ];
      expect(stages).toHaveLength(9);
      expect(stages).toContain('draft');
      expect(stages).toContain('awaiting_signatures');
      expect(stages).toContain('executing');
      expect(stages).toContain('completed');
      expect(stages).toContain('failed');
      expect(stages).toContain('time_locked');
      expect(stages).toContain('broadcast');
      expect(stages).toContain('cancelling');
      expect(stages).toContain('cancelled');
    });
  });

  describe('WithdrawalApprover shape', () => {
    it('creates a valid WithdrawalApprover object', () => {
      const approver: WithdrawalApprover = {
        staffId: 'staff-001',
        at: new Date().toISOString(),
        txSig: '0xdeadbeef',
      };
      expect(approver.staffId).toBe('staff-001');
      expect(approver.txSig).toBe('0xdeadbeef');
      expect(typeof approver.at).toBe('string');
    });
  });

  describe('WithdrawalMultisig shape', () => {
    it('creates a valid WithdrawalMultisig object', () => {
      const multisig: WithdrawalMultisig = {
        required: 2,
        total: 3,
        collected: 1,
        approvers: [],
        rejectedBy: null,
      };
      expect(multisig.required).toBe(2);
      expect(multisig.total).toBe(3);
      expect(multisig.collected).toBe(1);
      expect(multisig.approvers).toEqual([]);
      expect(multisig.rejectedBy).toBeNull();
    });

    it('accepts rejectedBy as a string', () => {
      const multisig: WithdrawalMultisig = {
        required: 2,
        total: 3,
        collected: 0,
        approvers: [],
        rejectedBy: 'staff-002',
      };
      expect(multisig.rejectedBy).toBe('staff-002');
    });

    it('accepts a list of approvers', () => {
      const approver: WithdrawalApprover = {
        staffId: 'staff-001',
        at: '2024-01-01T00:00:00Z',
        txSig: '0xsig',
      };
      const multisig: WithdrawalMultisig = {
        required: 2,
        total: 3,
        collected: 1,
        approvers: [approver],
        rejectedBy: null,
      };
      expect(multisig.approvers).toHaveLength(1);
      expect(multisig.approvers[0].staffId).toBe('staff-001');
    });
  });

  describe('WithdrawalRow shape', () => {
    const baseRow: WithdrawalRow = {
      id: 'wd-0001',
      chain: 'bnb',
      token: 'USDT',
      amount: 1000,
      destination: '0xDestination',
      stage: 'awaiting_signatures',
      risk: 'low',
      createdAt: new Date().toISOString(),
      requestedBy: 'staff-001',
      multisig: {
        required: 2,
        total: 3,
        collected: 1,
        approvers: [],
        rejectedBy: null,
      },
      txHash: null,
      note: null,
    };

    it('creates a valid WithdrawalRow with required fields', () => {
      expect(baseRow.id).toBe('wd-0001');
      expect(baseRow.chain).toBe('bnb');
      expect(baseRow.token).toBe('USDT');
      expect(baseRow.amount).toBe(1000);
      expect(baseRow.stage).toBe('awaiting_signatures');
      expect(baseRow.risk).toBe('low');
      expect(baseRow.txHash).toBeNull();
      expect(baseRow.note).toBeNull();
    });

    it('accepts sol chain', () => {
      const row: WithdrawalRow = { ...baseRow, chain: 'sol' };
      expect(row.chain).toBe('sol');
    });

    it('accepts USDC token', () => {
      const row: WithdrawalRow = { ...baseRow, token: 'USDC' };
      expect(row.token).toBe('USDC');
    });

    it('accepts risk levels: low, med, high', () => {
      const risks: WithdrawalRow['risk'][] = ['low', 'med', 'high'];
      risks.forEach((risk) => {
        const row: WithdrawalRow = { ...baseRow, risk };
        expect(row.risk).toBe(risk);
      });
    });

    it('accepts optional nonce field', () => {
      const row: WithdrawalRow = { ...baseRow, nonce: 42 };
      expect(row.nonce).toBe(42);
    });

    it('accepts optional sourceTier field', () => {
      const hot: WithdrawalRow = { ...baseRow, sourceTier: 'hot' };
      const cold: WithdrawalRow = { ...baseRow, sourceTier: 'cold' };
      expect(hot.sourceTier).toBe('hot');
      expect(cold.sourceTier).toBe('cold');
    });

    it('accepts optional timeLockExpiresAt field', () => {
      const row: WithdrawalRow = {
        ...baseRow,
        timeLockExpiresAt: '2024-12-31T23:59:59Z',
      };
      expect(row.timeLockExpiresAt).toBe('2024-12-31T23:59:59Z');
    });

    it('accepts optional multisigOpId field', () => {
      const row: WithdrawalRow = { ...baseRow, multisigOpId: 'op-999' };
      expect(row.multisigOpId).toBe('op-999');
    });

    it('accepts txHash as a string', () => {
      const row: WithdrawalRow = { ...baseRow, txHash: '0xabc123' };
      expect(row.txHash).toBe('0xabc123');
    });

    it('accepts note as a string', () => {
      const row: WithdrawalRow = { ...baseRow, note: 'test note' };
      expect(row.note).toBe('test note');
    });

    it('all stage literals can be assigned to stage field', () => {
      const stages: WithdrawalStage[] = [
        'draft',
        'awaiting_signatures',
        'executing',
        'completed',
        'failed',
        'time_locked',
        'broadcast',
        'cancelling',
        'cancelled',
      ];
      stages.forEach((stage) => {
        const row: WithdrawalRow = { ...baseRow, stage };
        expect(row.stage).toBe(stage);
      });
    });
  });
});
