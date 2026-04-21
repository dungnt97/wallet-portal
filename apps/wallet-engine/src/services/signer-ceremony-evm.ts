// EVM signer ceremony tx builder — encodes Safe owner-management calls.
// Uses ethers ABI encoding (safe ABI is standard) rather than the browser-only Protocol Kit.
//
// Safe owner management ABI methods:
//   addOwnerWithThreshold(owner, _threshold)
//   removeOwner(prevOwner, owner, _threshold)
//   swapOwner(prevOwner, oldOwner, newOwner)
//
// rotate-all: sequences individual add/swap/remove calls into a MultiSendCallOnly multicall.
import { Interface, concat, toBeHex, zeroPadValue } from 'ethers';
import pino from 'pino';

const logger = pino({ name: 'signer-ceremony-evm' });

// ── Safe GnosisSafe ABI fragments ─────────────────────────────────────────────

const SAFE_IFACE = new Interface([
  'function addOwnerWithThreshold(address owner, uint256 _threshold)',
  'function removeOwner(address prevOwner, address owner, uint256 _threshold)',
  'function swapOwner(address prevOwner, address oldOwner, address newOwner)',
]);

// ── MultiSendCallOnly ABI ─────────────────────────────────────────────────────

const MULTISEND_IFACE = new Interface(['function multiSend(bytes memory transactions)']);

/** Sentinel address used by Safe linked-list for owner prev-pointer when owner is at the head */
const SENTINEL_OWNER = '0x0000000000000000000000000000000000000001';

// ── Output shape — matches Safe tx data format ────────────────────────────────

export interface SafeTxData {
  /** Target contract address */
  to: string;
  /** Hex-encoded calldata */
  data: string;
  /** Value in wei as hex string (always '0x0' for owner ops) */
  value: string;
  /** 0 = call, 1 = delegatecall */
  operation: 0 | 1;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Encode a single MultiSend transaction entry.
 * Format: operation (1 byte) + to (20 bytes) + value (32 bytes) + dataLen (32 bytes) + data
 */
function encodeMultiSendEntry(op: 0 | 1, to: string, data: string): Uint8Array {
  const dataBytes = Buffer.from(data.replace(/^0x/, ''), 'hex');
  const opByte = Buffer.from([op]);
  const toBytes = Buffer.from(to.replace(/^0x/, '').padStart(40, '0'), 'hex');
  const valuePadded = Buffer.from(zeroPadValue('0x00', 32).replace(/^0x/, ''), 'hex');
  const lenPadded = Buffer.from(
    zeroPadValue(toBeHex(dataBytes.length), 32).replace(/^0x/, ''),
    'hex'
  );
  return concat([opByte, toBytes, valuePadded, lenPadded, dataBytes]) as unknown as Uint8Array;
}

// ── Public builders ───────────────────────────────────────────────────────────

/**
 * Build a Safe tx to add a new owner (threshold unchanged — pass current threshold).
 */
export function buildAddOwnerTx(
  safeAddr: string,
  newOwnerAddr: string,
  threshold: number
): SafeTxData {
  logger.debug({ safeAddr, newOwnerAddr, threshold }, 'buildAddOwnerTx');
  const data = SAFE_IFACE.encodeFunctionData('addOwnerWithThreshold', [newOwnerAddr, threshold]);
  return { to: safeAddr, data, value: '0x0', operation: 0 };
}

/**
 * Build a Safe tx to remove an owner.
 * prevOwner: the owner that points to ownerAddr in the Safe's linked-list.
 * Pass SENTINEL_OWNER if ownerAddr is the first owner in the list.
 */
export function buildRemoveOwnerTx(
  safeAddr: string,
  prevOwner: string,
  ownerAddr: string,
  threshold: number
): SafeTxData {
  logger.debug({ safeAddr, ownerAddr, threshold }, 'buildRemoveOwnerTx');
  const data = SAFE_IFACE.encodeFunctionData('removeOwner', [prevOwner, ownerAddr, threshold]);
  return { to: safeAddr, data, value: '0x0', operation: 0 };
}

/**
 * Build a rotate-all Safe tx via MultiSendCallOnly.
 * Sequences: adds first, then removes. Uses swapOwner for single-swap case.
 * For multi-op rotate uses addOwnerWithThreshold + removeOwner per pair.
 *
 * multiSendAddr: deployed MultiSendCallOnly contract address on the chain.
 */
export function buildRotateTx(params: {
  safeAddr: string;
  addOwners: string[];
  removeOwners: string[];
  prevOwners: string[]; // prevOwner[i] maps to removeOwners[i] in the linked list
  threshold: number;
  multiSendAddr: string;
}): SafeTxData {
  const { safeAddr, addOwners, removeOwners, prevOwners, threshold, multiSendAddr } = params;

  logger.debug(
    { safeAddr, addCount: addOwners.length, removeCount: removeOwners.length },
    'buildRotateTx'
  );

  const entries: Uint8Array[] = [];

  // Use swapOwner when 1:1 rotate (more gas efficient)
  if (addOwners.length === 1 && removeOwners.length === 1) {
    const swapData = SAFE_IFACE.encodeFunctionData('swapOwner', [
      prevOwners[0] ?? SENTINEL_OWNER,
      removeOwners[0],
      addOwners[0],
    ]);
    entries.push(encodeMultiSendEntry(0, safeAddr, swapData));
  } else {
    // Add new owners first
    for (const newOwner of addOwners) {
      const addData = SAFE_IFACE.encodeFunctionData('addOwnerWithThreshold', [newOwner, threshold]);
      entries.push(encodeMultiSendEntry(0, safeAddr, addData));
    }
    // Then remove old owners
    for (let i = 0; i < removeOwners.length; i++) {
      const removeData = SAFE_IFACE.encodeFunctionData('removeOwner', [
        prevOwners[i] ?? SENTINEL_OWNER,
        removeOwners[i],
        threshold,
      ]);
      entries.push(encodeMultiSendEntry(0, safeAddr, removeData));
    }
  }

  const packed = concat(entries as unknown as Uint8Array[]);
  const multiSendData = MULTISEND_IFACE.encodeFunctionData('multiSend', [packed]);

  // delegatecall (operation=1) is required for MultiSendCallOnly
  return { to: multiSendAddr, data: multiSendData, value: '0x0', operation: 1 };
}

// Export sentinel for callers that need it
export { SENTINEL_OWNER };
