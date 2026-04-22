// Unit tests for classifyConnectError — covers EVM + Solana rejection paths
// and ensures genuine errors still route to the 'error' branch.
import { describe, expect, it } from 'vitest';
import { classifyConnectError } from '../wallet-errors';

describe('classifyConnectError', () => {
  // --- EVM rejection cases ---

  it('classifies MetaMask EIP-1193 code 4001 as cancelled', () => {
    // MetaMask throws { code: 4001, message: 'MetaMask Tx Signature: User denied...' }
    const err = Object.assign(
      new Error('MetaMask Tx Signature: User denied transaction signature.'),
      {
        code: 4001,
      }
    );
    expect(classifyConnectError(err)).toBe('cancelled');
  });

  it('classifies viem UserRejectedRequestError (code 4001 plain object) as cancelled', () => {
    // Simulate the shape viem wraps: { code: 4001 }
    const err = { code: 4001, message: 'User rejected the request.' };
    expect(classifyConnectError(err)).toBe('cancelled');
  });

  it('classifies "user denied" string in message as cancelled', () => {
    const err = new Error('User Denied Transaction Signature');
    expect(classifyConnectError(err)).toBe('cancelled');
  });

  it('classifies "rejected" message as cancelled', () => {
    const err = new Error('Transaction rejected by user');
    expect(classifyConnectError(err)).toBe('cancelled');
  });

  it('classifies "closed" popup message as cancelled', () => {
    const err = new Error('The wallet popup was closed');
    expect(classifyConnectError(err)).toBe('cancelled');
  });

  // --- Solana rejection cases ---

  it('classifies WalletWindowClosedError as cancelled', () => {
    const err = new Error('Window closed');
    err.name = 'WalletWindowClosedError';
    expect(classifyConnectError(err)).toBe('cancelled');
  });

  it('classifies UserRejectedRequestError name as cancelled', () => {
    const err = new Error('User rejected');
    err.name = 'UserRejectedRequestError';
    expect(classifyConnectError(err)).toBe('cancelled');
  });

  // --- Genuine error cases ---

  it('classifies a random RPC error as error', () => {
    const err = new Error('Internal JSON-RPC error (-32603)');
    expect(classifyConnectError(err)).toBe('error');
  });

  it('classifies null as error', () => {
    expect(classifyConnectError(null)).toBe('error');
  });

  it('classifies undefined as error', () => {
    expect(classifyConnectError(undefined)).toBe('error');
  });

  it('classifies a non-rejection Error as error', () => {
    const err = new Error('Network timeout');
    expect(classifyConnectError(err)).toBe('error');
  });

  it('classifies an object without code 4001 as error', () => {
    const err = { code: 4900, message: 'Disconnected from chain' };
    expect(classifyConnectError(err)).toBe('error');
  });
});
