// Tests for use-withdrawal-actions.ts — approval, reject, execute, submit, signing flow.
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWithdrawalActions } from '../use-withdrawal-actions';
import type { WithdrawalRow } from '../withdrawal-types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockApproveMutate = vi.fn();
const mockExecuteMutate = vi.fn();
const mockRejectMutate = vi.fn();
const mockSubmitMutate = vi.fn();
const mockToast = vi.fn();
const mockSigningFlowStart = vi.fn();

vi.mock('@/api/queries', () => ({
  useApproveWithdrawal: vi.fn(() => ({ mutate: mockApproveMutate })),
  useExecuteWithdrawal: vi.fn(() => ({ mutate: mockExecuteMutate })),
  useRejectWithdrawal: vi.fn(() => ({ mutate: mockRejectMutate })),
  useSubmitWithdrawal: vi.fn(() => ({ mutate: mockSubmitMutate })),
}));

vi.mock('@/auth/use-auth', () => ({
  useAuth: vi.fn(() => ({
    staff: { id: 'staff-1', name: 'Alice', email: 'alice@x.com' },
  })),
}));

vi.mock('@/components/overlays', () => ({
  useToast: vi.fn(() => mockToast),
}));

vi.mock('react-i18next', () => ({
  useTranslation: vi.fn(() => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  })),
}));

vi.mock('../use-withdrawals', () => ({
  useWithdrawals: vi.fn(() => ({ data: [] })),
}));

vi.mock('../../signing', () => ({
  withdrawalToOp: vi.fn((w: WithdrawalRow) => ({ id: w.id, chain: w.chain })),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

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
  nonce: 1,
  sourceTier: 'hot',
  withdrawalId: 'wd-001',
};

const mockSigningFlow = {
  start: mockSigningFlowStart,
  state: {
    step: 'idle' as const,
    op: null,
    signature: null,
    hwAttestation: null,
    stepUp: null,
    rejectReason: null,
    broadcastResult: null,
    error: null,
  },
  cancel: vi.fn(),
  reject: vi.fn(),
  reset: vi.fn(),
  confirmReview: vi.fn(),
  walletSigned: vi.fn(),
  stepUpPassed: vi.fn(),
  useOtpFallback: vi.fn(),
  otpVerified: vi.fn(),
  hwAttested: vi.fn(),
  broadcastComplete: vi.fn(),
  broadcastFailed: vi.fn(),
};

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useWithdrawalActions', () => {
  it('initializes with selected=null and empty list', () => {
    const { result } = renderHook(() => useWithdrawalActions(mockSigningFlow as never, vi.fn()));
    expect(result.current.selected).toBeNull();
    expect(result.current.list).toEqual([]);
  });

  it('setSelected updates selected withdrawal', () => {
    const { result } = renderHook(() => useWithdrawalActions(mockSigningFlow as never, vi.fn()));
    act(() => {
      result.current.setSelected(mockWithdrawal);
    });
    expect(result.current.selected).toEqual(mockWithdrawal);
  });

  it('setSelected accepts null to deselect', () => {
    const { result } = renderHook(() => useWithdrawalActions(mockSigningFlow as never, vi.fn()));
    act(() => {
      result.current.setSelected(mockWithdrawal);
    });
    act(() => {
      result.current.setSelected(null);
    });
    expect(result.current.selected).toBeNull();
  });

  it('onApprove calls signingFlow.start with the withdrawal op', () => {
    const { result } = renderHook(() => useWithdrawalActions(mockSigningFlow as never, vi.fn()));
    act(() => {
      result.current.onApprove(mockWithdrawal);
    });
    expect(mockSigningFlowStart).toHaveBeenCalledOnce();
  });

  it('onApprove does not call signingFlow.start when staff is null', async () => {
    const { useAuth } = await import('@/auth/use-auth');
    vi.mocked(useAuth).mockReturnValue({ staff: null } as never);

    const { result } = renderHook(() => useWithdrawalActions(mockSigningFlow as never, vi.fn()));
    act(() => {
      result.current.onApprove(mockWithdrawal);
    });
    expect(mockSigningFlowStart).not.toHaveBeenCalled();

    // restore
    vi.mocked(useAuth).mockReturnValue({
      staff: { id: 'staff-1', name: 'Alice', email: 'alice@x.com' },
    } as never);
  });

  it('onReject calls rejectMutation.mutate', () => {
    const { result } = renderHook(() => useWithdrawalActions(mockSigningFlow as never, vi.fn()));
    act(() => {
      result.current.onReject(mockWithdrawal);
    });
    expect(mockRejectMutate).toHaveBeenCalledOnce();
  });

  it('onReject does not call mutation when staff is null', async () => {
    const { useAuth } = await import('@/auth/use-auth');
    vi.mocked(useAuth).mockReturnValue({ staff: null } as never);

    const { result } = renderHook(() => useWithdrawalActions(mockSigningFlow as never, vi.fn()));
    act(() => {
      result.current.onReject(mockWithdrawal);
    });
    expect(mockRejectMutate).not.toHaveBeenCalled();

    vi.mocked(useAuth).mockReturnValue({
      staff: { id: 'staff-1', name: 'Alice', email: 'alice@x.com' },
    } as never);
  });

  it('onExecute calls executeMutation.mutate and shows queued toast', () => {
    const { result } = renderHook(() => useWithdrawalActions(mockSigningFlow as never, vi.fn()));
    act(() => {
      result.current.onExecute(mockWithdrawal);
    });
    expect(mockExecuteMutate).toHaveBeenCalledOnce();
    expect(mockToast).toHaveBeenCalledWith(
      expect.stringContaining('withdrawals.executeQueued'),
      'success'
    );
  });

  it('onSubmitDraft calls submitMutation.mutate', () => {
    const { result } = renderHook(() => useWithdrawalActions(mockSigningFlow as never, vi.fn()));
    act(() => {
      result.current.onSubmitDraft(mockWithdrawal);
    });
    expect(mockSubmitMutate).toHaveBeenCalledOnce();
  });

  it('onNewSubmit calls onCreated callback and shows toast', () => {
    const onCreated = vi.fn();
    const { result } = renderHook(() => useWithdrawalActions(mockSigningFlow as never, onCreated));
    act(() => {
      result.current.onNewSubmit(mockWithdrawal);
    });
    expect(onCreated).toHaveBeenCalledOnce();
    expect(mockToast).toHaveBeenCalledWith(
      expect.stringContaining('withdrawals.createSuccess'),
      'success'
    );
  });

  it('onSigningComplete is no-op when no pending withdrawal (approve not called first)', () => {
    const { result } = renderHook(() => useWithdrawalActions(mockSigningFlow as never, vi.fn()));
    act(() => {
      result.current.onSigningComplete();
    });
    expect(mockApproveMutate).not.toHaveBeenCalled();
  });

  it('onSigningComplete shows error toast when signature is null', () => {
    const flowWithNoSig = {
      ...mockSigningFlow,
      state: { ...mockSigningFlow.state, signature: null },
    };
    const { result } = renderHook(() => useWithdrawalActions(flowWithNoSig as never, vi.fn()));
    // First onApprove to set pendingSignWithdrawal
    act(() => {
      result.current.onApprove(mockWithdrawal);
    });
    act(() => {
      result.current.onSigningComplete();
    });
    expect(mockToast).toHaveBeenCalledWith(expect.stringContaining('approveError'), 'error');
    expect(mockApproveMutate).not.toHaveBeenCalled();
  });

  it('onSigningComplete calls approveMutation.mutate when signature is present', () => {
    const flowWithSig = {
      ...mockSigningFlow,
      state: {
        ...mockSigningFlow.state,
        signature: { signer: '0xSigner', signature: '0xSig', at: '' },
        hwAttestation: null,
      },
    };
    const { result } = renderHook(() => useWithdrawalActions(flowWithSig as never, vi.fn()));
    act(() => {
      result.current.onApprove(mockWithdrawal);
    });
    act(() => {
      result.current.onSigningComplete();
    });
    expect(mockApproveMutate).toHaveBeenCalledOnce();
  });

  it('onSigningRejected adds failed override and shows cancelled toast', () => {
    const { result } = renderHook(() => useWithdrawalActions(mockSigningFlow as never, vi.fn()));
    // Set pending withdrawal via onApprove first
    act(() => {
      result.current.onApprove(mockWithdrawal);
    });
    act(() => {
      result.current.onSigningRejected();
    });
    expect(mockToast).toHaveBeenCalledWith(
      expect.stringContaining('withdrawals.signatureCancelled'),
      'success'
    );
  });

  it('list applies localOverrides on top of fetched data', async () => {
    const { useWithdrawals } = await import('../use-withdrawals');
    vi.mocked(useWithdrawals).mockReturnValue({ data: [mockWithdrawal] } as never);

    const { result } = renderHook(() => useWithdrawalActions(mockSigningFlow as never, vi.fn()));
    expect(result.current.list).toHaveLength(1);
    expect(result.current.list[0].id).toBe('wd-001');
  });

  it('onReject success callback applies override with failed stage', () => {
    // Trigger mutate and call onSuccess manually
    let capturedOnSuccess: (() => void) | undefined;
    mockRejectMutate.mockImplementation((_: unknown, opts: { onSuccess?: () => void }) => {
      capturedOnSuccess = opts.onSuccess;
    });

    const { result } = renderHook(() => useWithdrawalActions(mockSigningFlow as never, vi.fn()));
    act(() => {
      result.current.onReject(mockWithdrawal);
    });
    act(() => {
      capturedOnSuccess?.();
    });
    expect(result.current.selected?.stage).toBe('failed');
  });

  it('onExecute success callback applies override with executing stage', () => {
    let capturedOnSuccess: (() => void) | undefined;
    mockExecuteMutate.mockImplementation((_: unknown, opts: { onSuccess?: () => void }) => {
      capturedOnSuccess = opts.onSuccess;
    });

    const { result } = renderHook(() => useWithdrawalActions(mockSigningFlow as never, vi.fn()));
    act(() => {
      result.current.setSelected(mockWithdrawal);
    });
    act(() => {
      result.current.onExecute(mockWithdrawal);
    });
    act(() => {
      capturedOnSuccess?.();
    });
    expect(result.current.selected?.stage).toBe('executing');
  });

  it('onSubmitDraft success callback applies override with awaiting_signatures stage', () => {
    let capturedOnSuccess: (() => void) | undefined;
    mockSubmitMutate.mockImplementation((_: undefined, opts: { onSuccess?: () => void }) => {
      capturedOnSuccess = opts.onSuccess;
    });

    const { result } = renderHook(() => useWithdrawalActions(mockSigningFlow as never, vi.fn()));
    act(() => {
      result.current.setSelected(mockWithdrawal);
    });
    act(() => {
      result.current.onSubmitDraft(mockWithdrawal);
    });
    act(() => {
      capturedOnSuccess?.();
    });
    expect(result.current.selected?.stage).toBe('awaiting_signatures');
  });
});
