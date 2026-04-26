// Tests for features/withdrawals/approval-queue.tsx — ApprovalQueue multisig progress.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApprovalQueue } from '../approval-queue';
import type { WithdrawalMultisig } from '../withdrawal-types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) => (opts ? `${k}:${JSON.stringify(opts)}` : k),
  }),
}));

vi.mock('@/icons', () => ({
  I: {
    Shield: () => <span data-testid="icon-shield" />,
    UserX: () => <span data-testid="icon-user-x" />,
    Check: () => <span data-testid="icon-check" />,
    Clock: () => <span data-testid="icon-clock" />,
  },
}));

vi.mock('../../_shared/realtime', () => ({
  LiveTimeAgo: ({ at }: { at: string }) => <span data-testid="live-time-ago">{at}</span>,
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeMultisig(overrides: Partial<WithdrawalMultisig> = {}): WithdrawalMultisig {
  return {
    required: 2,
    total: 3,
    collected: 0,
    approvers: [],
    rejectedBy: null,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ApprovalQueue', () => {
  it('renders the approval box container', () => {
    render(<ApprovalQueue multisig={makeMultisig()} stage="awaiting_signatures" chain="bnb" />);
    expect(document.querySelector('.approval-box')).toBeInTheDocument();
  });

  it('renders the shield icon', () => {
    render(<ApprovalQueue multisig={makeMultisig()} stage="awaiting_signatures" chain="bnb" />);
    expect(screen.getByTestId('icon-shield')).toBeInTheDocument();
  });

  it('renders the progress bar', () => {
    render(<ApprovalQueue multisig={makeMultisig()} stage="awaiting_signatures" chain="bnb" />);
    expect(document.querySelector('.approval-bar')).toBeInTheDocument();
  });

  it('bar width is proportional to collected/required', () => {
    render(
      <ApprovalQueue
        multisig={makeMultisig({ collected: 1, required: 2 })}
        stage="awaiting_signatures"
        chain="bnb"
      />
    );
    const fill = document.querySelector('.approval-bar-fill') as HTMLElement;
    expect(fill.style.width).toBe('50%');
  });

  it('bar width is capped at 100% when collected exceeds required', () => {
    render(
      <ApprovalQueue
        multisig={makeMultisig({ collected: 3, required: 2 })}
        stage="completed"
        chain="bnb"
      />
    );
    const fill = document.querySelector('.approval-bar-fill') as HTMLElement;
    expect(fill.style.width).toBe('100%');
  });

  it('bar uses err color for failed stage', () => {
    render(<ApprovalQueue multisig={makeMultisig()} stage="failed" chain="bnb" />);
    const fill = document.querySelector('.approval-bar-fill') as HTMLElement;
    expect(fill.style.background).toBe('var(--err)');
  });

  it('bar uses err color for cancelled stage', () => {
    render(<ApprovalQueue multisig={makeMultisig()} stage="cancelled" chain="bnb" />);
    const fill = document.querySelector('.approval-bar-fill') as HTMLElement;
    expect(fill.style.background).toBe('var(--err)');
  });

  it('bar uses ok color when collected >= required', () => {
    render(
      <ApprovalQueue
        multisig={makeMultisig({ collected: 2, required: 2 })}
        stage="completed"
        chain="bnb"
      />
    );
    const fill = document.querySelector('.approval-bar-fill') as HTMLElement;
    expect(fill.style.background).toBe('var(--ok)');
  });

  it('shows rejectedBy panel when rejectedBy is set', () => {
    render(
      <ApprovalQueue
        multisig={makeMultisig({ rejectedBy: 'staff-123' })}
        stage="failed"
        chain="bnb"
      />
    );
    expect(screen.getByTestId('icon-user-x')).toBeInTheDocument();
  });

  it('does not show rejectedBy panel when rejectedBy is null', () => {
    render(
      <ApprovalQueue
        multisig={makeMultisig({ rejectedBy: null })}
        stage="awaiting_signatures"
        chain="bnb"
      />
    );
    expect(screen.queryByTestId('icon-user-x')).not.toBeInTheDocument();
  });

  it('renders approver rows for each approver', () => {
    render(
      <ApprovalQueue
        multisig={makeMultisig({
          collected: 1,
          approvers: [{ staffId: 'staff-abc123', at: '2024-01-01T00:00:00Z', txSig: 'sig001' }],
        })}
        stage="awaiting_signatures"
        chain="bnb"
      />
    );
    expect(document.querySelectorAll('.signer-row').length).toBeGreaterThan(0);
  });

  it('shows "you" badge for current staff approver', () => {
    render(
      <ApprovalQueue
        multisig={makeMultisig({
          collected: 1,
          approvers: [{ staffId: 'me-123', at: '2024-01-01T00:00:00Z', txSig: '' }],
        })}
        stage="awaiting_signatures"
        chain="bnb"
        currentStaffId="me-123"
      />
    );
    expect(screen.getByText('withdrawals.you')).toBeInTheDocument();
  });

  it('does not show "you" badge for different staff', () => {
    render(
      <ApprovalQueue
        multisig={makeMultisig({
          collected: 1,
          approvers: [{ staffId: 'other-456', at: '2024-01-01T00:00:00Z', txSig: '' }],
        })}
        stage="awaiting_signatures"
        chain="bnb"
        currentStaffId="me-123"
      />
    );
    expect(screen.queryByText('withdrawals.you')).not.toBeInTheDocument();
  });

  it('renders pending slots for remaining approvals needed', () => {
    render(
      <ApprovalQueue
        multisig={makeMultisig({
          collected: 1,
          required: 3,
          approvers: [{ staffId: 'a', at: '', txSig: '' }],
        })}
        stage="awaiting_signatures"
        chain="bnb"
      />
    );
    // 2 pending slots remain
    expect(screen.getAllByText('withdrawals.awaitingSignature').length).toBe(2);
  });

  it('shows "no signatures" message when approvers is empty', () => {
    render(
      <ApprovalQueue
        multisig={makeMultisig({ collected: 0, required: 2, approvers: [] })}
        stage="awaiting_signatures"
        chain="bnb"
      />
    );
    expect(screen.getByText(/No signatures collected yet/)).toBeInTheDocument();
  });

  it('renders LiveTimeAgo for each approver', () => {
    render(
      <ApprovalQueue
        multisig={makeMultisig({
          collected: 2,
          approvers: [
            { staffId: 'a1', at: '2024-01-01T00:00:00Z', txSig: '' },
            { staffId: 'b2', at: '2024-01-02T00:00:00Z', txSig: '' },
          ],
        })}
        stage="completed"
        chain="bnb"
      />
    );
    expect(screen.getAllByTestId('live-time-ago').length).toBe(2);
  });
});
