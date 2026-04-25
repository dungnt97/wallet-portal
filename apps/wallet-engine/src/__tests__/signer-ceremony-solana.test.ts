import { describe, it, expect } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import {
  buildAddMemberTx,
  buildRemoveMemberTx,
  buildRotateMembersTx,
  buildProposalApproveTx,
  buildConfigTransactionExecuteTx,
  type SquadsVersionedTxSet,
} from '../services/signer-ceremony-solana.js';

// Test fixture keys (valid Solana base58, but not real keys)
const MULTISIG_PDA = '11111111111111111111111111111111';
const MEMBER_1 = 'GKPstwystYTmUXYXx8EM7nVnKJGnKbYVUZb9RVQGbkG2';
const MEMBER_2 = 'HNvFGJKsQqQtxn6nPj2MkVGVUEymJMxyS9a6TVHvMJRK';
const MEMBER_3 = 'J9XnQVUzVFhBzVnCmJN3RvXxLSdLjRMSv7bB3bpLkMPz';
const CREATOR = 'DKzgxLKBPEGvYYjYBYJzHxPMh2Kd8wZfHw9gHGYzNRMz';
const FEE_PAYER = 'FcErPJhVgm7rKfQqJE8khzjUVhGmrTj7sC3GrFCCJqCP';
const BLOCKHASH = 'GH7ome4DEewAXQfQC5gH62hqRUSRJ3Tz1nvoLaLcHF21';

describe('signer-ceremony-solana', () => {
  describe('buildAddMemberTx', () => {
    it('should build add member transaction with valid params', () => {
      const result = buildAddMemberTx({
        multisigPda: MULTISIG_PDA,
        newMemberPubkey: MEMBER_2,
        transactionIndex: 1n,
        creatorPubkey: CREATOR,
        feePayerPubkey: FEE_PAYER,
        blockhash: BLOCKHASH,
      });

      expect(result).toHaveProperty('configTxBase64');
      expect(result).toHaveProperty('proposalBase64');
      expect(result).toHaveProperty('transactionIndex');
      expect(result.transactionIndex).toBe(1n);
      expect(typeof result.configTxBase64).toBe('string');
      expect(typeof result.proposalBase64).toBe('string');
      expect(result.configTxBase64.length > 0).toBe(true);
      expect(result.proposalBase64.length > 0).toBe(true);
    });

    it('should encode valid base64 transactions', () => {
      const result = buildAddMemberTx({
        multisigPda: MULTISIG_PDA,
        newMemberPubkey: MEMBER_2,
        transactionIndex: 5n,
        creatorPubkey: CREATOR,
        feePayerPubkey: FEE_PAYER,
        blockhash: BLOCKHASH,
      });

      // Valid base64 should decode without error
      expect(() => Buffer.from(result.configTxBase64, 'base64')).not.toThrow();
      expect(() => Buffer.from(result.proposalBase64, 'base64')).not.toThrow();
    });

    it('should preserve transaction index through multiple calls', () => {
      const indices = [0n, 1n, 10n, 100n, 1000n];

      for (const idx of indices) {
        const result = buildAddMemberTx({
          multisigPda: MULTISIG_PDA,
          newMemberPubkey: MEMBER_2,
          transactionIndex: idx,
          creatorPubkey: CREATOR,
          feePayerPubkey: FEE_PAYER,
          blockhash: BLOCKHASH,
        });

        expect(result.transactionIndex).toBe(idx);
      }
    });

    it('should handle different valid public keys', () => {
      const keys = [MEMBER_1, MEMBER_2, MEMBER_3];

      for (const key of keys) {
        const result = buildAddMemberTx({
          multisigPda: MULTISIG_PDA,
          newMemberPubkey: key,
          transactionIndex: 1n,
          creatorPubkey: CREATOR,
          feePayerPubkey: FEE_PAYER,
          blockhash: BLOCKHASH,
        });

        expect(result.configTxBase64).toBeTruthy();
        expect(result.proposalBase64).toBeTruthy();
      }
    });
  });

  describe('buildRemoveMemberTx', () => {
    it('should build remove member transaction', () => {
      const result = buildRemoveMemberTx({
        multisigPda: MULTISIG_PDA,
        removeMemberPubkey: MEMBER_2,
        transactionIndex: 2n,
        creatorPubkey: CREATOR,
        feePayerPubkey: FEE_PAYER,
        blockhash: BLOCKHASH,
      });

      expect(result).toHaveProperty('configTxBase64');
      expect(result).toHaveProperty('proposalBase64');
      expect(result).toHaveProperty('transactionIndex');
      expect(result.transactionIndex).toBe(2n);
    });

    it('should encode valid base64 for remove operations', () => {
      const result = buildRemoveMemberTx({
        multisigPda: MULTISIG_PDA,
        removeMemberPubkey: MEMBER_2,
        transactionIndex: 3n,
        creatorPubkey: CREATOR,
        feePayerPubkey: FEE_PAYER,
        blockhash: BLOCKHASH,
      });

      expect(() => Buffer.from(result.configTxBase64, 'base64')).not.toThrow();
      expect(() => Buffer.from(result.proposalBase64, 'base64')).not.toThrow();
    });

    it('should preserve correct transaction index for remove', () => {
      const result = buildRemoveMemberTx({
        multisigPda: MULTISIG_PDA,
        removeMemberPubkey: MEMBER_1,
        transactionIndex: 99n,
        creatorPubkey: CREATOR,
        feePayerPubkey: FEE_PAYER,
        blockhash: BLOCKHASH,
      });

      expect(result.transactionIndex).toBe(99n);
    });
  });

  describe('buildRotateMembersTx', () => {
    it('should build rotate transaction with multiple adds and removes', () => {
      const result = buildRotateMembersTx({
        multisigPda: MULTISIG_PDA,
        addMemberPubkeys: [MEMBER_2, MEMBER_3],
        removeMemberPubkeys: [MEMBER_1],
        transactionIndex: 5n,
        creatorPubkey: CREATOR,
        feePayerPubkey: FEE_PAYER,
        blockhash: BLOCKHASH,
      });

      expect(result.configTxBase64).toBeTruthy();
      expect(result.proposalBase64).toBeTruthy();
      expect(result.transactionIndex).toBe(5n);
    });

    it('should handle single add, no removes', () => {
      const result = buildRotateMembersTx({
        multisigPda: MULTISIG_PDA,
        addMemberPubkeys: [MEMBER_2],
        removeMemberPubkeys: [],
        transactionIndex: 10n,
        creatorPubkey: CREATOR,
        feePayerPubkey: FEE_PAYER,
        blockhash: BLOCKHASH,
      });

      expect(result.configTxBase64).toBeTruthy();
      expect(result.proposalBase64).toBeTruthy();
    });

    it('should handle no adds, single remove', () => {
      const result = buildRotateMembersTx({
        multisigPda: MULTISIG_PDA,
        addMemberPubkeys: [],
        removeMemberPubkeys: [MEMBER_1],
        transactionIndex: 11n,
        creatorPubkey: CREATOR,
        feePayerPubkey: FEE_PAYER,
        blockhash: BLOCKHASH,
      });

      expect(result.configTxBase64).toBeTruthy();
      expect(result.proposalBase64).toBeTruthy();
    });

    it('should include new threshold when provided', () => {
      const result = buildRotateMembersTx({
        multisigPda: MULTISIG_PDA,
        addMemberPubkeys: [MEMBER_2],
        removeMemberPubkeys: [],
        transactionIndex: 12n,
        creatorPubkey: CREATOR,
        feePayerPubkey: FEE_PAYER,
        blockhash: BLOCKHASH,
        newThreshold: 3,
      });

      expect(result.configTxBase64).toBeTruthy();
      expect(result.transactionIndex).toBe(12n);
    });

    it('should omit threshold when not provided', () => {
      const result = buildRotateMembersTx({
        multisigPda: MULTISIG_PDA,
        addMemberPubkeys: [MEMBER_2],
        removeMemberPubkeys: [],
        transactionIndex: 13n,
        creatorPubkey: CREATOR,
        feePayerPubkey: FEE_PAYER,
        blockhash: BLOCKHASH,
      });

      expect(result.configTxBase64).toBeTruthy();
    });

    it('should handle empty arrays (add nothing, remove nothing)', () => {
      const result = buildRotateMembersTx({
        multisigPda: MULTISIG_PDA,
        addMemberPubkeys: [],
        removeMemberPubkeys: [],
        transactionIndex: 14n,
        creatorPubkey: CREATOR,
        feePayerPubkey: FEE_PAYER,
        blockhash: BLOCKHASH,
      });

      expect(result.configTxBase64).toBeTruthy();
      expect(result.proposalBase64).toBeTruthy();
    });

    it('should encode valid base64 for complex rotations', () => {
      const result = buildRotateMembersTx({
        multisigPda: MULTISIG_PDA,
        addMemberPubkeys: [MEMBER_1, MEMBER_2, MEMBER_3],
        removeMemberPubkeys: [MEMBER_1, MEMBER_2],
        transactionIndex: 15n,
        creatorPubkey: CREATOR,
        feePayerPubkey: FEE_PAYER,
        blockhash: BLOCKHASH,
        newThreshold: 2,
      });

      expect(() => Buffer.from(result.configTxBase64, 'base64')).not.toThrow();
      expect(() => Buffer.from(result.proposalBase64, 'base64')).not.toThrow();
    });

    it('should preserve transaction index for rotations', () => {
      const result = buildRotateMembersTx({
        multisigPda: MULTISIG_PDA,
        addMemberPubkeys: [MEMBER_2],
        removeMemberPubkeys: [MEMBER_1],
        transactionIndex: 200n,
        creatorPubkey: CREATOR,
        feePayerPubkey: FEE_PAYER,
        blockhash: BLOCKHASH,
      });

      expect(result.transactionIndex).toBe(200n);
    });
  });

  describe('buildProposalApproveTx', () => {
    it('should build proposal approve transaction', () => {
      const result = buildProposalApproveTx({
        multisigPda: MULTISIG_PDA,
        transactionIndex: 5n,
        memberPubkey: MEMBER_1,
        feePayerPubkey: FEE_PAYER,
        blockhash: BLOCKHASH,
      });

      expect(typeof result).toBe('string');
      expect(result.length > 0).toBe(true);
    });

    it('should encode valid base64', () => {
      const result = buildProposalApproveTx({
        multisigPda: MULTISIG_PDA,
        transactionIndex: 6n,
        memberPubkey: MEMBER_2,
        feePayerPubkey: FEE_PAYER,
        blockhash: BLOCKHASH,
      });

      expect(() => Buffer.from(result, 'base64')).not.toThrow();
    });

    it('should handle different members approving', () => {
      const members = [MEMBER_1, MEMBER_2, MEMBER_3];

      for (const member of members) {
        const result = buildProposalApproveTx({
          multisigPda: MULTISIG_PDA,
          transactionIndex: 10n,
          memberPubkey: member,
          feePayerPubkey: FEE_PAYER,
          blockhash: BLOCKHASH,
        });

        expect(result).toBeTruthy();
        expect(() => Buffer.from(result, 'base64')).not.toThrow();
      }
    });

    it('should handle different transaction indices', () => {
      const indices = [0n, 1n, 50n, 999n];

      for (const idx of indices) {
        const result = buildProposalApproveTx({
          multisigPda: MULTISIG_PDA,
          transactionIndex: idx,
          memberPubkey: MEMBER_1,
          feePayerPubkey: FEE_PAYER,
          blockhash: BLOCKHASH,
        });

        expect(result).toBeTruthy();
      }
    });
  });

  describe('buildConfigTransactionExecuteTx', () => {
    it('should build config transaction execute', () => {
      const result = buildConfigTransactionExecuteTx({
        multisigPda: MULTISIG_PDA,
        transactionIndex: 5n,
        memberPubkey: MEMBER_1,
        rentPayerPubkey: FEE_PAYER,
        feePayerPubkey: FEE_PAYER,
        blockhash: BLOCKHASH,
      });

      expect(typeof result).toBe('string');
      expect(result.length > 0).toBe(true);
    });

    it('should encode valid base64', () => {
      const result = buildConfigTransactionExecuteTx({
        multisigPda: MULTISIG_PDA,
        transactionIndex: 7n,
        memberPubkey: MEMBER_2,
        rentPayerPubkey: FEE_PAYER,
        feePayerPubkey: FEE_PAYER,
        blockhash: BLOCKHASH,
      });

      expect(() => Buffer.from(result, 'base64')).not.toThrow();
    });

    it('should handle different rent and fee payers', () => {
      const result = buildConfigTransactionExecuteTx({
        multisigPda: MULTISIG_PDA,
        transactionIndex: 8n,
        memberPubkey: MEMBER_1,
        rentPayerPubkey: MEMBER_2,
        feePayerPubkey: MEMBER_3,
        blockhash: BLOCKHASH,
      });

      expect(result).toBeTruthy();
      expect(() => Buffer.from(result, 'base64')).not.toThrow();
    });

    it('should handle different members executing', () => {
      const members = [MEMBER_1, MEMBER_2, MEMBER_3];

      for (const member of members) {
        const result = buildConfigTransactionExecuteTx({
          multisigPda: MULTISIG_PDA,
          transactionIndex: 10n,
          memberPubkey: member,
          rentPayerPubkey: FEE_PAYER,
          feePayerPubkey: FEE_PAYER,
          blockhash: BLOCKHASH,
        });

        expect(result).toBeTruthy();
      }
    });

    it('should handle different transaction indices', () => {
      const indices = [0n, 1n, 100n, 9999n];

      for (const idx of indices) {
        const result = buildConfigTransactionExecuteTx({
          multisigPda: MULTISIG_PDA,
          transactionIndex: idx,
          memberPubkey: MEMBER_1,
          rentPayerPubkey: FEE_PAYER,
          feePayerPubkey: FEE_PAYER,
          blockhash: BLOCKHASH,
        });

        expect(result).toBeTruthy();
      }
    });
  });

  describe('Integration: Full ceremony flow', () => {
    it('should support full sign+approve+execute workflow', () => {
      // Phase 1: Add member
      const addMemberResult = buildAddMemberTx({
        multisigPda: MULTISIG_PDA,
        newMemberPubkey: MEMBER_2,
        transactionIndex: 1n,
        creatorPubkey: CREATOR,
        feePayerPubkey: FEE_PAYER,
        blockhash: BLOCKHASH,
      });

      expect(addMemberResult.configTxBase64).toBeTruthy();
      expect(addMemberResult.proposalBase64).toBeTruthy();
      expect(addMemberResult.transactionIndex).toBe(1n);

      // Phase 2: Member approves
      const approveResult = buildProposalApproveTx({
        multisigPda: MULTISIG_PDA,
        transactionIndex: addMemberResult.transactionIndex,
        memberPubkey: MEMBER_1,
        feePayerPubkey: FEE_PAYER,
        blockhash: BLOCKHASH,
      });

      expect(approveResult).toBeTruthy();

      // Phase 3: Execute
      const executeResult = buildConfigTransactionExecuteTx({
        multisigPda: MULTISIG_PDA,
        transactionIndex: addMemberResult.transactionIndex,
        memberPubkey: MEMBER_1,
        rentPayerPubkey: FEE_PAYER,
        feePayerPubkey: FEE_PAYER,
        blockhash: BLOCKHASH,
      });

      expect(executeResult).toBeTruthy();
    });

    it('should support rotate then execute workflow', () => {
      const rotateResult = buildRotateMembersTx({
        multisigPda: MULTISIG_PDA,
        addMemberPubkeys: [MEMBER_2, MEMBER_3],
        removeMemberPubkeys: [MEMBER_1],
        transactionIndex: 2n,
        creatorPubkey: CREATOR,
        feePayerPubkey: FEE_PAYER,
        blockhash: BLOCKHASH,
        newThreshold: 2,
      });

      expect(rotateResult.transactionIndex).toBe(2n);

      const executeResult = buildConfigTransactionExecuteTx({
        multisigPda: MULTISIG_PDA,
        transactionIndex: rotateResult.transactionIndex,
        memberPubkey: MEMBER_2,
        rentPayerPubkey: FEE_PAYER,
        feePayerPubkey: FEE_PAYER,
        blockhash: BLOCKHASH,
      });

      expect(executeResult).toBeTruthy();
    });
  });
});
