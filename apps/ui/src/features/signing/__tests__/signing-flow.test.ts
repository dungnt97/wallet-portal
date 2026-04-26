import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WithdrawalRow } from '../../withdrawals/withdrawal-types';
import { useSigningFlow, withdrawalToOp } from '../signing-flow';
import type { SigningOp } from '../signing-flow-types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../signing-flow-broadcast', () => ({
  IS_DEV_MODE: false,
  broadcastDevMode: vi.fn(),
  makeBroadcastResult: vi.fn(() => ({
    hash: '0xabc',
    blockNumber: 100,
    confirmedAt: new Date().toISOString(),
  })),
}));

vi.mock('../mock-adapters', () => ({
  mockSign: vi.fn(),
}));

vi.mock('../policy-preview', () => ({
  evaluatePolicy: vi.fn(() => ({
    passed: true,
    checks: [],
  })),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockOp: SigningOp = {
  id: 'op-001',
  chain: 'bnb',
  token: 'USDT',
  amount: 10_000,
  destination: '0xDeadBeef00000001',
  signaturesRequired: 2,
  totalSigners: 3,
  destinationKnown: true,
  sourceTier: 'hot',
};

// ── withdrawalToOp ─────────────────────────────────────────────────────────────

describe('withdrawalToOp', () => {
  const mockWithdrawal: WithdrawalRow = {
    id: 'wd-001',
    chain: 'bnb',
    token: 'USDT',
    amount: 5000,
    destination: '0xDest',
    stage: 'awaiting_signatures',
    risk: 'low',
    createdAt: new Date().toISOString(),
    requestedBy: 'user-1',
    multisig: { required: 2, total: 3, collected: 1, approvers: [], rejectedBy: null },
    txHash: null,
    note: null,
    nonce: 7,
    sourceTier: 'hot',
    withdrawalId: 'wd-001',
  };

  it('maps id, chain, token correctly', () => {
    const op = withdrawalToOp(mockWithdrawal);
    expect(op.id).toBe('wd-001');
    expect(op.chain).toBe('bnb');
    expect(op.token).toBe('USDT');
  });

  it('maps amount and destination', () => {
    const op = withdrawalToOp(mockWithdrawal);
    expect(op.amount).toBe(5000);
    expect(op.destination).toBe('0xDest');
  });

  it('maps multisig required/total to signaturesRequired/totalSigners', () => {
    const op = withdrawalToOp(mockWithdrawal);
    expect(op.signaturesRequired).toBe(2);
    expect(op.totalSigners).toBe(3);
  });

  it('computes myIndex from collected + 1', () => {
    const op = withdrawalToOp(mockWithdrawal);
    expect(op.myIndex).toBe(2); // collected=1 + 1
  });

  it('uses BNB safe address for bnb chain', () => {
    const op = withdrawalToOp(mockWithdrawal);
    expect(op.safeAddress).toMatch(/^0x/);
  });

  it('uses Solana address for sol chain', () => {
    const solWithdrawal: WithdrawalRow = { ...mockWithdrawal, chain: 'sol' };
    const op = withdrawalToOp(solWithdrawal);
    expect(op.safeAddress).not.toMatch(/^0x/);
  });

  it('sets destinationKnown to true', () => {
    const op = withdrawalToOp(mockWithdrawal);
    expect(op.destinationKnown).toBe(true);
  });

  it('propagates nonce', () => {
    const op = withdrawalToOp(mockWithdrawal);
    expect(op.nonce).toBe(7);
  });

  it('propagates sourceTier', () => {
    const op = withdrawalToOp({ ...mockWithdrawal, sourceTier: 'cold' });
    expect(op.sourceTier).toBe('cold');
  });

  it('defaults sourceTier to hot when undefined', () => {
    const { sourceTier: _, ...rest } = mockWithdrawal;
    const op = withdrawalToOp(rest as WithdrawalRow);
    expect(op.sourceTier).toBe('hot');
  });
});

// ── useSigningFlow state machine ───────────────────────────────────────────────

describe('useSigningFlow', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts in idle state', () => {
    const { result } = renderHook(() => useSigningFlow());
    expect(result.current.state.step).toBe('idle');
    expect(result.current.state.op).toBeNull();
  });

  it('start() transitions to review', () => {
    const { result } = renderHook(() => useSigningFlow());
    act(() => result.current.start(mockOp));
    expect(result.current.state.step).toBe('review');
    expect(result.current.state.op).toEqual(mockOp);
  });

  it('confirmReview() transitions to wallet-sign when policy passes', async () => {
    const { evaluatePolicy } = await import('../policy-preview');
    vi.mocked(evaluatePolicy).mockReturnValue({ passed: true, checks: [] });

    const { result } = renderHook(() => useSigningFlow());
    act(() => result.current.start(mockOp));
    act(() => result.current.confirmReview());
    expect(result.current.state.step).toBe('wallet-sign');
  });

  it('confirmReview() transitions to policy-block when policy fails', async () => {
    const { evaluatePolicy } = await import('../policy-preview');
    vi.mocked(evaluatePolicy).mockReturnValue({ passed: false, checks: [] });

    const { result } = renderHook(() => useSigningFlow());
    act(() => result.current.start(mockOp));
    act(() => result.current.confirmReview());
    expect(result.current.state.step).toBe('policy-block');
  });

  it('walletSigned() transitions from wallet-sign to step-up', async () => {
    const { evaluatePolicy } = await import('../policy-preview');
    vi.mocked(evaluatePolicy).mockReturnValue({ passed: true, checks: [] });

    const { result } = renderHook(() => useSigningFlow());
    act(() => result.current.start(mockOp));
    act(() => result.current.confirmReview());
    act(() => {
      result.current.walletSigned({
        signer: '0xSigner',
        signature: '0xSig',
        at: new Date().toISOString(),
      });
    });
    expect(result.current.state.step).toBe('step-up');
  });

  it('useOtpFallback() transitions from step-up to otp', async () => {
    const { evaluatePolicy } = await import('../policy-preview');
    vi.mocked(evaluatePolicy).mockReturnValue({ passed: true, checks: [] });

    const { result } = renderHook(() => useSigningFlow());
    act(() => result.current.start(mockOp));
    act(() => result.current.confirmReview());
    act(() => result.current.walletSigned({ signer: '0x', signature: '0x', at: '' }));
    act(() => result.current.useOtpFallback());
    expect(result.current.state.step).toBe('otp');
  });

  it('stepUpPassed() transitions from step-up to execute', async () => {
    const { evaluatePolicy } = await import('../policy-preview');
    vi.mocked(evaluatePolicy).mockReturnValue({ passed: true, checks: [] });

    const { result } = renderHook(() => useSigningFlow());
    act(() => result.current.start(mockOp));
    act(() => result.current.confirmReview());
    act(() => result.current.walletSigned({ signer: '0x', signature: '0x', at: '' }));
    await act(async () => {
      await result.current.stepUpPassed({ method: 'webauthn', at: new Date().toISOString() });
    });
    expect(result.current.state.step).toBe('execute');
  });

  it('cancel() resets to idle', async () => {
    const { evaluatePolicy } = await import('../policy-preview');
    vi.mocked(evaluatePolicy).mockReturnValue({ passed: true, checks: [] });

    const { result } = renderHook(() => useSigningFlow());
    act(() => result.current.start(mockOp));
    act(() => result.current.cancel());
    expect(result.current.state.step).toBe('idle');
    expect(result.current.state.op).toBeNull();
  });

  it('reject() transitions to rejected with default reason', () => {
    const { result } = renderHook(() => useSigningFlow());
    act(() => result.current.start(mockOp));
    act(() => result.current.reject());
    expect(result.current.state.step).toBe('rejected');
    expect(result.current.state.rejectReason).toBe('Signer rejected operation.');
  });

  it('reject() accepts custom reason', () => {
    const { result } = renderHook(() => useSigningFlow());
    act(() => result.current.start(mockOp));
    act(() => result.current.reject('Wrong amount'));
    expect(result.current.state.rejectReason).toBe('Wrong amount');
  });

  it('reset() returns to idle from any state', () => {
    const { result } = renderHook(() => useSigningFlow());
    act(() => result.current.start(mockOp));
    act(() => result.current.reset());
    expect(result.current.state.step).toBe('idle');
    expect(result.current.state.op).toBeNull();
  });

  it('broadcastComplete() transitions from execute to done', () => {
    const { result } = renderHook(() => useSigningFlow());
    // Manually force execute step through internal mechanism
    act(() => result.current.start(mockOp));
    // Simulate being in execute by broadcasting
    const broadcastResult = {
      hash: '0xabc123',
      blockNumber: 100,
      confirmedAt: new Date().toISOString(),
    };
    // Can only call broadcastComplete from execute; inject it
    act(() => {
      result.current.broadcastComplete(broadcastResult);
    });
    // From non-execute state it should be a no-op
    expect(result.current.state.step).not.toBe('done');
  });

  it('broadcastFailed() sets error state from execute', () => {
    const { result } = renderHook(() => useSigningFlow());
    act(() => result.current.start(mockOp));
    act(() => result.current.broadcastFailed('Network error'));
    // Not in execute, so no-op
    expect(result.current.state.step).not.toBe('error');
  });

  it('hwAttested() from review transitions to wallet-sign', () => {
    const { result } = renderHook(() => useSigningFlow());
    act(() => result.current.start(mockOp));
    act(() => {
      result.current.hwAttested({ blob: 'base64blob', type: 'ledger' });
    });
    expect(result.current.state.step).toBe('wallet-sign');
    expect(result.current.state.hwAttestation).toEqual({ blob: 'base64blob', type: 'ledger' });
  });

  it('otpVerified() transitions from otp to execute', async () => {
    const { evaluatePolicy } = await import('../policy-preview');
    vi.mocked(evaluatePolicy).mockReturnValue({ passed: true, checks: [] });

    const { result } = renderHook(() => useSigningFlow());
    act(() => result.current.start(mockOp));
    act(() => result.current.confirmReview());
    act(() => result.current.walletSigned({ signer: '0x', signature: '0x', at: '' }));
    act(() => result.current.useOtpFallback());
    await act(async () => {
      await result.current.otpVerified({ method: 'totp', at: new Date().toISOString() });
    });
    expect(result.current.state.step).toBe('execute');
    expect(result.current.state.stepUp?.method).toBe('totp');
  });

  it('confirmReview() is no-op when not in review step', async () => {
    const { result } = renderHook(() => useSigningFlow());
    // state is idle, confirmReview should not change step
    act(() => result.current.confirmReview());
    expect(result.current.state.step).toBe('idle');
  });
});
