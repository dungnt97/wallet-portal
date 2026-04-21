// Vitest component tests for CeremonyProgress.
// Covers: pending state renders correctly, confirmed shows both chains green,
// partial shows red banner with runbook link, cancel button visible/disabled.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import i18n from 'i18next';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';

// ── Module mocks ──────────────────────────────────────────────────────────────

const mockCancelMutate = vi.fn();

vi.mock('@/api/signer-ceremony-queries', () => ({
  useCancelCeremony: vi.fn(),
  useCeremony: vi.fn(),
}));

import { useCancelCeremony, useCeremony } from '@/api/signer-ceremony-queries';
import type { CeremonyRow } from '@/api/signers';
import { CeremonyProgress } from '../ceremony-progress';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeCeremony(overrides: Partial<CeremonyRow> = {}): CeremonyRow {
  return {
    id: 'cer-uuid-001',
    operationType: 'signer_add',
    initiatedBy: 'staff-init-001',
    targetAdd: ['staff-target-001'],
    targetRemove: [],
    status: 'pending',
    reason: 'Onboarding new treasurer',
    chainStates: {
      bnb: { status: 'pending' },
      solana: { status: 'pending' },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function Wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={makeQC()}>{children}</QueryClientProvider>;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CeremonyProgress', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    vi.clearAllMocks();
    vi.mocked(useCancelCeremony).mockReturnValue({
      mutate: mockCancelMutate,
      isPending: false,
      isError: false,
      isSuccess: false,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useCancelCeremony>);
  });

  it('renders both chain labels for a pending ceremony', () => {
    render(
      <Wrapper>
        <CeremonyProgress ceremony={makeCeremony()} />
      </Wrapper>
    );

    expect(screen.getByText('BNB Chain (Safe)')).toBeInTheDocument();
    expect(screen.getByText('Solana (Squads)')).toBeInTheDocument();
  });

  it('shows cancel button when status is pending and no tx broadcast', () => {
    render(
      <Wrapper>
        <CeremonyProgress ceremony={makeCeremony({ status: 'pending' })} />
      </Wrapper>
    );

    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('does not show cancel button in readOnly mode', () => {
    render(
      <Wrapper>
        <CeremonyProgress ceremony={makeCeremony({ status: 'pending' })} readOnly />
      </Wrapper>
    );

    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
  });

  it('does not show cancel button when ceremony is confirmed', () => {
    render(
      <Wrapper>
        <CeremonyProgress
          ceremony={makeCeremony({
            status: 'confirmed',
            chainStates: {
              bnb: { status: 'confirmed', txHash: '0xabc' },
              solana: { status: 'confirmed', txHash: 'SolTxHash' },
            },
          })}
        />
      </Wrapper>
    );

    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
  });

  it('does not show cancel button when a chain is executing', () => {
    render(
      <Wrapper>
        <CeremonyProgress
          ceremony={makeCeremony({
            status: 'in_progress',
            chainStates: {
              bnb: { status: 'executing' },
              solana: { status: 'pending' },
            },
          })}
        />
      </Wrapper>
    );

    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
  });

  it('shows red partial-state banner with runbook link when status=partial', () => {
    render(
      <Wrapper>
        <CeremonyProgress
          ceremony={makeCeremony({
            status: 'partial',
            chainStates: {
              bnb: { status: 'confirmed', txHash: '0xabc' },
              solana: { status: 'failed', errorReason: 'tx reverted' },
            },
          })}
        />
      </Wrapper>
    );

    // Partial title text from i18n
    expect(screen.getByText(/partial completion/i)).toBeInTheDocument();
    // Runbook link
    expect(screen.getByRole('link', { name: /runbook/i })).toBeInTheDocument();
  });

  it('shows tx hash link when chain has txHash', () => {
    render(
      <Wrapper>
        <CeremonyProgress
          ceremony={makeCeremony({
            status: 'confirmed',
            chainStates: {
              bnb: { status: 'confirmed', txHash: '0xdeadbeefdeadbeefdeadbeef' },
              solana: { status: 'confirmed', txHash: 'SolLongTxHashABCD1234' },
            },
          })}
        />
      </Wrapper>
    );

    // Both chains show external links
    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThanOrEqual(2);
    expect(links[0]).toHaveAttribute('href', expect.stringContaining('bscscan.com'));
    expect(links[1]).toHaveAttribute('href', expect.stringContaining('solscan.io'));
  });

  it('calls cancel mutation when cancel button is clicked', () => {
    render(
      <Wrapper>
        <CeremonyProgress ceremony={makeCeremony({ status: 'pending' })} />
      </Wrapper>
    );

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(mockCancelMutate).toHaveBeenCalledWith('cer-uuid-001');
  });

  it('disables cancel button while cancel mutation is pending', () => {
    vi.mocked(useCancelCeremony).mockReturnValue({
      mutate: mockCancelMutate,
      isPending: true,
      isError: false,
      isSuccess: false,
      reset: vi.fn(),
    } as unknown as ReturnType<typeof useCancelCeremony>);

    render(
      <Wrapper>
        <CeremonyProgress ceremony={makeCeremony({ status: 'pending' })} />
      </Wrapper>
    );

    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
  });

  it('shows reason text when ceremony has a reason', () => {
    render(
      <Wrapper>
        <CeremonyProgress ceremony={makeCeremony({ reason: 'Quarterly rotation test' })} />
      </Wrapper>
    );

    expect(screen.getByText(/Quarterly rotation test/)).toBeInTheDocument();
  });

  it('shows error reason for failed chain', () => {
    render(
      <Wrapper>
        <CeremonyProgress
          ceremony={makeCeremony({
            status: 'partial',
            chainStates: {
              bnb: { status: 'confirmed', txHash: '0xabc' },
              solana: { status: 'failed', errorReason: 'insufficient fee payer balance' },
            },
          })}
        />
      </Wrapper>
    );

    expect(screen.getByText(/insufficient fee payer balance/)).toBeInTheDocument();
  });
});
