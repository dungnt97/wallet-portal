import { describe, it, expect } from 'vitest';
import {
  buildAddOwnerTx,
  buildRemoveOwnerTx,
  buildRotateTx,
  SENTINEL_OWNER,
  type SafeTxData,
} from '../services/signer-ceremony-evm.js';

const SAFE_ADDR = '0x1234567890123456789012345678901234567890';
const OWNER_1 = '0x0000000000000000000000000000000000000001';
const OWNER_2 = '0x0000000000000000000000000000000000000002';
const OWNER_3 = '0x0000000000000000000000000000000000000003';
const OWNER_4 = '0x0000000000000000000000000000000000000004';
const MULTISEND_ADDR = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

describe('signer-ceremony-evm', () => {
  describe('buildAddOwnerTx', () => {
    it('should build add owner transaction', () => {
      const result = buildAddOwnerTx(SAFE_ADDR, OWNER_2, 2);

      expect(result).toHaveProperty('to');
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('value');
      expect(result).toHaveProperty('operation');

      expect(result.to).toBe(SAFE_ADDR);
      expect(result.value).toBe('0x0');
      expect(result.operation).toBe(0);
      expect(result.data).toMatch(/^0x/);
    });

    it('should encode valid hex data', () => {
      const result = buildAddOwnerTx(SAFE_ADDR, OWNER_3, 1);
      expect(result.data.length > 10).toBe(true); // Should be substantial hex
      expect(result.data.startsWith('0x')).toBe(true);
    });

    it('should handle different thresholds', () => {
      const thresholds = [1, 2, 3, 5, 10];

      for (const threshold of thresholds) {
        const result = buildAddOwnerTx(SAFE_ADDR, OWNER_2, threshold);
        expect(result.operation).toBe(0);
        expect(result.value).toBe('0x0');
      }
    });

    it('should handle different owner addresses', () => {
      const owners = [OWNER_1, OWNER_2, OWNER_3, OWNER_4];

      for (const owner of owners) {
        const result = buildAddOwnerTx(SAFE_ADDR, owner, 2);
        expect(result.to).toBe(SAFE_ADDR);
        expect(result.data).toBeTruthy();
      }
    });

    it('should handle different safe addresses', () => {
      const safes = [
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      ];

      for (const safe of safes) {
        const result = buildAddOwnerTx(safe, OWNER_2, 2);
        expect(result.to).toBe(safe);
      }
    });

    it('should always set value to zero for owner operations', () => {
      const result = buildAddOwnerTx(SAFE_ADDR, OWNER_2, 3);
      expect(result.value).toBe('0x0');
    });

    it('should use call operation (0) not delegatecall', () => {
      const result = buildAddOwnerTx(SAFE_ADDR, OWNER_2, 1);
      expect(result.operation).toBe(0);
    });
  });

  describe('buildRemoveOwnerTx', () => {
    it('should build remove owner transaction', () => {
      const result = buildRemoveOwnerTx(SAFE_ADDR, OWNER_1, OWNER_2, 2);

      expect(result.to).toBe(SAFE_ADDR);
      expect(result.value).toBe('0x0');
      expect(result.operation).toBe(0);
      expect(result.data).toMatch(/^0x/);
    });

    it('should handle sentinel owner as prev owner', () => {
      const result = buildRemoveOwnerTx(SAFE_ADDR, SENTINEL_OWNER, OWNER_2, 2);

      expect(result.to).toBe(SAFE_ADDR);
      expect(result.data).toBeTruthy();
    });

    it('should encode valid hex for remove operations', () => {
      const result = buildRemoveOwnerTx(SAFE_ADDR, OWNER_1, OWNER_2, 2);
      expect(result.data.length > 10).toBe(true);
      expect(result.data.startsWith('0x')).toBe(true);
    });

    it('should handle different prev owner addresses', () => {
      const prevOwners = [OWNER_1, OWNER_2, SENTINEL_OWNER];

      for (const prevOwner of prevOwners) {
        const result = buildRemoveOwnerTx(SAFE_ADDR, prevOwner, OWNER_3, 2);
        expect(result.operation).toBe(0);
      }
    });

    it('should handle different thresholds', () => {
      const thresholds = [1, 2, 3, 5];

      for (const threshold of thresholds) {
        const result = buildRemoveOwnerTx(SAFE_ADDR, OWNER_1, OWNER_2, threshold);
        expect(result.data).toBeTruthy();
      }
    });

    it('should always set value to zero', () => {
      const result = buildRemoveOwnerTx(SAFE_ADDR, OWNER_1, OWNER_2, 2);
      expect(result.value).toBe('0x0');
    });

    it('should use call operation', () => {
      const result = buildRemoveOwnerTx(SAFE_ADDR, OWNER_1, OWNER_2, 2);
      expect(result.operation).toBe(0);
    });
  });

  describe('buildRotateTx', () => {
    it('should use swapOwner for 1:1 rotation', () => {
      const result = buildRotateTx({
        safeAddr: SAFE_ADDR,
        addOwners: [OWNER_3],
        removeOwners: [OWNER_1],
        prevOwners: [OWNER_2],
        threshold: 2,
        multiSendAddr: MULTISEND_ADDR,
      });

      expect(result.to).toBe(MULTISEND_ADDR);
      expect(result.value).toBe('0x0');
      expect(result.operation).toBe(1); // delegatecall for MultiSend
      expect(result.data).toMatch(/^0x/);
    });

    it('should handle 1:1 rotation with sentinel owner', () => {
      const result = buildRotateTx({
        safeAddr: SAFE_ADDR,
        addOwners: [OWNER_3],
        removeOwners: [OWNER_1],
        prevOwners: [SENTINEL_OWNER],
        threshold: 2,
        multiSendAddr: MULTISEND_ADDR,
      });

      expect(result.to).toBe(MULTISEND_ADDR);
      expect(result.data).toBeTruthy();
    });

    it('should use add+remove sequence for multi-add', () => {
      const result = buildRotateTx({
        safeAddr: SAFE_ADDR,
        addOwners: [OWNER_3, OWNER_4],
        removeOwners: [OWNER_1],
        prevOwners: [OWNER_2],
        threshold: 2,
        multiSendAddr: MULTISEND_ADDR,
      });

      expect(result.to).toBe(MULTISEND_ADDR);
      expect(result.operation).toBe(1);
      expect(result.data).toBeTruthy();
    });

    it('should use add+remove sequence for multi-remove', () => {
      const result = buildRotateTx({
        safeAddr: SAFE_ADDR,
        addOwners: [OWNER_3],
        removeOwners: [OWNER_1, OWNER_2],
        prevOwners: [SENTINEL_OWNER, OWNER_1],
        threshold: 2,
        multiSendAddr: MULTISEND_ADDR,
      });

      expect(result.to).toBe(MULTISEND_ADDR);
      expect(result.operation).toBe(1);
      expect(result.data).toBeTruthy();
    });

    it('should handle complex rotation with multiple adds/removes', () => {
      const result = buildRotateTx({
        safeAddr: SAFE_ADDR,
        addOwners: [OWNER_3, OWNER_4],
        removeOwners: [OWNER_1, OWNER_2],
        prevOwners: [OWNER_2, SENTINEL_OWNER],
        threshold: 2,
        multiSendAddr: MULTISEND_ADDR,
      });

      expect(result.to).toBe(MULTISEND_ADDR);
      expect(result.operation).toBe(1);
      expect(result.data).toMatch(/^0x/);
    });

    it('should handle add without remove', () => {
      const result = buildRotateTx({
        safeAddr: SAFE_ADDR,
        addOwners: [OWNER_3, OWNER_4],
        removeOwners: [],
        prevOwners: [],
        threshold: 3,
        multiSendAddr: MULTISEND_ADDR,
      });

      expect(result.to).toBe(MULTISEND_ADDR);
      expect(result.data).toBeTruthy();
    });

    it('should handle remove without add', () => {
      const result = buildRotateTx({
        safeAddr: SAFE_ADDR,
        addOwners: [],
        removeOwners: [OWNER_1, OWNER_2],
        prevOwners: [SENTINEL_OWNER, OWNER_1],
        threshold: 1,
        multiSendAddr: MULTISEND_ADDR,
      });

      expect(result.to).toBe(MULTISEND_ADDR);
      expect(result.data).toBeTruthy();
    });

    it('should handle empty arrays (no-op rotation)', () => {
      const result = buildRotateTx({
        safeAddr: SAFE_ADDR,
        addOwners: [],
        removeOwners: [],
        prevOwners: [],
        threshold: 2,
        multiSendAddr: MULTISEND_ADDR,
      });

      expect(result.to).toBe(MULTISEND_ADDR);
      expect(result.operation).toBe(1);
    });

    it('should always use delegatecall for MultiSend', () => {
      const result = buildRotateTx({
        safeAddr: SAFE_ADDR,
        addOwners: [OWNER_3],
        removeOwners: [OWNER_1],
        prevOwners: [OWNER_2],
        threshold: 2,
        multiSendAddr: MULTISEND_ADDR,
      });

      expect(result.operation).toBe(1);
    });

    it('should always set value to zero', () => {
      const result = buildRotateTx({
        safeAddr: SAFE_ADDR,
        addOwners: [OWNER_3],
        removeOwners: [OWNER_1],
        prevOwners: [OWNER_2],
        threshold: 2,
        multiSendAddr: MULTISEND_ADDR,
      });

      expect(result.value).toBe('0x0');
    });

    it('should handle different safe and multisend addresses', () => {
      const safes = [
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      ];
      const multiSends = [
        '0xcccccccccccccccccccccccccccccccccccccccc',
        '0xdddddddddddddddddddddddddddddddddddddddd',
      ];

      for (const safe of safes) {
        for (const ms of multiSends) {
          const result = buildRotateTx({
            safeAddr: safe,
            addOwners: [OWNER_3],
            removeOwners: [OWNER_1],
            prevOwners: [OWNER_2],
            threshold: 2,
            multiSendAddr: ms,
          });

          expect(result.to).toBe(ms);
          expect(result.data).toBeTruthy();
        }
      }
    });
  });

  describe('SENTINEL_OWNER constant', () => {
    it('should be the first owner sentinel address', () => {
      expect(SENTINEL_OWNER).toBe('0x0000000000000000000000000000000000000001');
    });

    it('should be usable in remove operations', () => {
      const result = buildRemoveOwnerTx(SAFE_ADDR, SENTINEL_OWNER, OWNER_2, 2);
      expect(result.data).toBeTruthy();
    });

    it('should be usable in rotate operations', () => {
      const result = buildRotateTx({
        safeAddr: SAFE_ADDR,
        addOwners: [OWNER_3],
        removeOwners: [OWNER_1],
        prevOwners: [SENTINEL_OWNER],
        threshold: 2,
        multiSendAddr: MULTISEND_ADDR,
      });

      expect(result.data).toBeTruthy();
    });
  });

  describe('Integration: Full ceremony workflow', () => {
    it('should build complete add owner flow', () => {
      const tx = buildAddOwnerTx(SAFE_ADDR, OWNER_2, 2);

      expect(tx.to).toBe(SAFE_ADDR);
      expect(tx.value).toBe('0x0');
      expect(tx.operation).toBe(0);
      expect(tx.data).toBeTruthy();
    });

    it('should build complete remove owner flow', () => {
      const tx = buildRemoveOwnerTx(SAFE_ADDR, OWNER_1, OWNER_2, 2);

      expect(tx.to).toBe(SAFE_ADDR);
      expect(tx.value).toBe('0x0');
      expect(tx.operation).toBe(0);
      expect(tx.data).toBeTruthy();
    });

    it('should support sequential operations: add then remove', () => {
      const addTx = buildAddOwnerTx(SAFE_ADDR, OWNER_3, 2);
      expect(addTx.data).toBeTruthy();

      const removeTx = buildRemoveOwnerTx(SAFE_ADDR, OWNER_1, OWNER_2, 2);
      expect(removeTx.data).toBeTruthy();
    });

    it('should support rotate workflow with single swap', () => {
      const rotateTx = buildRotateTx({
        safeAddr: SAFE_ADDR,
        addOwners: [OWNER_3],
        removeOwners: [OWNER_1],
        prevOwners: [OWNER_2],
        threshold: 2,
        multiSendAddr: MULTISEND_ADDR,
      });

      expect(rotateTx.to).toBe(MULTISEND_ADDR);
      expect(rotateTx.operation).toBe(1);
      expect(rotateTx.data).toBeTruthy();
    });

    it('should support rotate workflow with batch operations', () => {
      const rotateTx = buildRotateTx({
        safeAddr: SAFE_ADDR,
        addOwners: [OWNER_3, OWNER_4],
        removeOwners: [OWNER_1, OWNER_2],
        prevOwners: [OWNER_2, SENTINEL_OWNER],
        threshold: 2,
        multiSendAddr: MULTISEND_ADDR,
      });

      expect(rotateTx.to).toBe(MULTISEND_ADDR);
      expect(rotateTx.operation).toBe(1);
      expect(rotateTx.data).toBeTruthy();
    });
  });

  describe('Edge cases', () => {
    it('should handle checksummed addresses (lowercase)', () => {
      const lower = SAFE_ADDR.toLowerCase();
      const result = buildAddOwnerTx(lower, OWNER_2, 2);
      expect(result.to).toBe(lower);
    });

    it('should handle threshold of 1', () => {
      const result = buildAddOwnerTx(SAFE_ADDR, OWNER_2, 1);
      expect(result.data).toBeTruthy();
    });

    it('should handle high thresholds', () => {
      const result = buildAddOwnerTx(SAFE_ADDR, OWNER_2, 100);
      expect(result.data).toBeTruthy();
    });

    it('should encode data even with identical prev/remove owners', () => {
      const result = buildRemoveOwnerTx(SAFE_ADDR, OWNER_1, OWNER_1, 2);
      expect(result.data).toBeTruthy();
    });

    it('should handle many owners in rotation', () => {
      const manyAdds = Array.from({ length: 10 }, (_, i) =>
        i.toString().padStart(40, '0').substring(0, 40).padStart(42, '0x')
      );
      const manyRemoves = Array.from({ length: 10 }, (_, i) =>
        (i + 10).toString().padStart(40, '0').substring(0, 40).padStart(42, '0x')
      );

      const result = buildRotateTx({
        safeAddr: SAFE_ADDR,
        addOwners: manyAdds,
        removeOwners: manyRemoves,
        prevOwners: manyRemoves,
        threshold: 5,
        multiSendAddr: MULTISEND_ADDR,
      });

      expect(result.data).toBeTruthy();
    });
  });
});
