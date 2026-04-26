// Tests for features/multisig/vault-card.tsx — TreasurerTeamCard component.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) => (opts ? `${k}:${JSON.stringify(opts)}` : k),
  }),
}));

vi.mock('@/features/_shared/realtime', () => ({
  LiveDot: ({ variant }: { variant: string }) => <span data-testid={`live-dot-${variant}`} />,
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import type { StaffMemberRow } from '@/api/queries';
import { TreasurerTeamCard } from '../vault-card';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTreasurer(overrides: Partial<StaffMemberRow> = {}): StaffMemberRow {
  return {
    id: 'tr-1',
    name: 'Alice Keeper',
    email: 'alice@example.com',
    initials: 'AK',
    role: 'treasurer',
    status: 'active',
    lastLoginAt: null,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TreasurerTeamCard', () => {
  it('renders treasurer team title', () => {
    render(<TreasurerTeamCard treasurers={[]} required={2} total={3} />);
    expect(screen.getByText('multisig.treasurerTeam')).toBeInTheDocument();
  });

  it('shows cosign required text', () => {
    render(<TreasurerTeamCard treasurers={[]} required={2} total={3} />);
    expect(screen.getByText(/multisig\.cosigRequired/)).toBeInTheDocument();
  });

  it('shows policy active badge', () => {
    render(<TreasurerTeamCard treasurers={[]} required={2} total={3} />);
    expect(screen.getByText('multisig.policyActive')).toBeInTheDocument();
  });

  it('shows loading message when treasurers is empty', () => {
    render(<TreasurerTeamCard treasurers={[]} required={2} total={3} />);
    expect(screen.getByText('common.loading')).toBeInTheDocument();
  });

  it('renders treasurer name', () => {
    render(<TreasurerTeamCard treasurers={[makeTreasurer()]} required={2} total={3} />);
    expect(screen.getByText('Alice Keeper')).toBeInTheDocument();
  });

  it('renders treasurer email', () => {
    render(<TreasurerTeamCard treasurers={[makeTreasurer()]} required={2} total={3} />);
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
  });

  it('renders treasurer initials in avatar', () => {
    render(<TreasurerTeamCard treasurers={[makeTreasurer()]} required={2} total={3} />);
    expect(screen.getByText('AK')).toBeInTheDocument();
  });

  it('shows treasurer role pill', () => {
    render(<TreasurerTeamCard treasurers={[makeTreasurer()]} required={2} total={3} />);
    expect(screen.getByText('multisig.treasurers')).toBeInTheDocument();
  });

  it('shows offline dot when lastLoginAt is null', () => {
    render(
      <TreasurerTeamCard
        treasurers={[makeTreasurer({ lastLoginAt: null })]}
        required={2}
        total={3}
      />
    );
    expect(screen.getByTestId('live-dot-muted')).toBeInTheDocument();
  });

  it('shows online dot for very recent login', () => {
    const recentLogin = new Date(Date.now() - 2 * 60 * 1000).toISOString(); // 2 min ago
    render(
      <TreasurerTeamCard
        treasurers={[makeTreasurer({ lastLoginAt: recentLogin })]}
        required={2}
        total={3}
      />
    );
    expect(screen.getByTestId('live-dot-ok')).toBeInTheDocument();
    expect(screen.getByText('multisig.presence.online')).toBeInTheDocument();
  });

  it('shows away dot for 10-minute-old login', () => {
    const awayLogin = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago
    render(
      <TreasurerTeamCard
        treasurers={[makeTreasurer({ lastLoginAt: awayLogin })]}
        required={2}
        total={3}
      />
    );
    expect(screen.getByTestId('live-dot-warn')).toBeInTheDocument();
    expect(screen.getByText('multisig.presence.away')).toBeInTheDocument();
  });

  it('shows offline presence for old login', () => {
    const oldLogin = new Date(Date.now() - 2 * 3600 * 1000).toISOString(); // 2 hours ago
    render(
      <TreasurerTeamCard
        treasurers={[makeTreasurer({ lastLoginAt: oldLogin })]}
        required={2}
        total={3}
      />
    );
    expect(screen.getByText('multisig.presence.offline')).toBeInTheDocument();
  });

  it('renders multiple treasurers', () => {
    render(
      <TreasurerTeamCard
        treasurers={[
          makeTreasurer({ id: 'tr-1', name: 'Alice', initials: 'A', email: 'a@example.com' }),
          makeTreasurer({ id: 'tr-2', name: 'Bob', initials: 'B', email: 'b@example.com' }),
        ]}
        required={2}
        total={2}
      />
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });
});
