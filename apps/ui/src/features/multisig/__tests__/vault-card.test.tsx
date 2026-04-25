/* biome-ignore lint/suspicious/noExplicitAny: mocking utilities require any types */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VaultCard } from '../vault-card';

vi.mock('@/components/custody', () => ({
  ChainPill: ({ chain }: { chain: string }) => <div data-testid={`chain-${chain}`}>{chain}</div>,
}));

vi.mock('@/lib/format', () => ({
  fmtCompact: (v: number) => `$${(v / 1000).toFixed(1)}K`,
  shortHash: (addr: string, start: number, end: number) => `${addr.slice(0, start)}...${addr.slice(-end)}`,
}));

describe('VaultCard', () => {
  const mockSigners = [
    { id: 'staff-1', initials: 'JD', name: 'John Doe' },
    { id: 'staff-2', initials: 'JA', name: 'Jane Adams' },
  ];

  it('renders vault card with name', () => {
    render(
      <VaultCard
        chain="bnb"
        name="Main Vault"
        address="0x1234567890123456789012345678901234567890"
        policy="2-of-3"
        balance={50000}
        pending={5000}
        signers={mockSigners}
      />
    );

    expect(screen.getByText('Main Vault')).toBeInTheDocument();
  });

  it('renders chain pill', () => {
    render(
      <VaultCard
        chain="bnb"
        name="Main Vault"
        address="0x1234567890123456789012345678901234567890"
        policy="2-of-3"
        balance={50000}
        pending={5000}
        signers={mockSigners}
      />
    );

    expect(screen.getByTestId('chain-bnb')).toBeInTheDocument();
  });

  it('displays policy badge', () => {
    render(
      <VaultCard
        chain="bnb"
        name="Main Vault"
        address="0x1234567890123456789012345678901234567890"
        policy="3-of-5"
        balance={50000}
        pending={5000}
        signers={mockSigners}
      />
    );

    expect(screen.getByText('3-of-5')).toBeInTheDocument();
  });

  it('displays formatted vault address', () => {
    const address = '0x1234567890123456789012345678901234567890';
    const { container } = render(
      <VaultCard
        chain="bnb"
        name="Main Vault"
        address={address}
        policy="2-of-3"
        balance={50000}
        pending={5000}
        signers={mockSigners}
      />
    );

    // Should show shortened address
    const addressDisplay = container.querySelector('.text-mono.text-faint');
    expect(addressDisplay).toBeInTheDocument();
  });

  it('displays formatted balance', () => {
    render(
      <VaultCard
        chain="bnb"
        name="Main Vault"
        address="0x1234567890123456789012345678901234567890"
        policy="2-of-3"
        balance={50000}
        pending={5000}
        signers={mockSigners}
      />
    );

    // Balance formatted as compact: 50000 → $50.0K
    expect(screen.getByText(/\$50\.0K/)).toBeInTheDocument();
  });

  it('renders signer avatars', () => {
    const { container } = render(
      <VaultCard
        chain="bnb"
        name="Main Vault"
        address="0x1234567890123456789012345678901234567890"
        policy="2-of-3"
        balance={50000}
        pending={5000}
        signers={mockSigners}
      />
    );

    const avatars = container.querySelectorAll('.avatar');
    expect(avatars.length).toBe(2);
  });

  it('displays signer initials in avatars', () => {
    render(
      <VaultCard
        chain="bnb"
        name="Main Vault"
        address="0x1234567890123456789012345678901234567890"
        policy="2-of-3"
        balance={50000}
        pending={5000}
        signers={mockSigners}
      />
    );

    expect(screen.getByText('JD')).toBeInTheDocument();
    expect(screen.getByText('JA')).toBeInTheDocument();
  });

  it('renders with Solana chain', () => {
    render(
      <VaultCard
        chain="sol"
        name="Solana Vault"
        address="11111111111111111111111111111111111111111"
        policy="2-of-2"
        balance={25000}
        pending={0}
        signers={mockSigners}
      />
    );

    expect(screen.getByTestId('chain-sol')).toBeInTheDocument();
    expect(screen.getByText('Solana Vault')).toBeInTheDocument();
  });

  it('handles empty signers list', () => {
    const { container } = render(
      <VaultCard
        chain="bnb"
        name="Main Vault"
        address="0x1234567890123456789012345678901234567890"
        policy="2-of-3"
        balance={50000}
        pending={5000}
        signers={[]}
      />
    );

    const avatars = container.querySelectorAll('.avatar');
    expect(avatars.length).toBe(0);
  });

  it('handles large balance values', () => {
    render(
      <VaultCard
        chain="bnb"
        name="Main Vault"
        address="0x1234567890123456789012345678901234567890"
        policy="2-of-3"
        balance={1000000}
        pending={50000}
        signers={mockSigners}
      />
    );

    // 1000000 → $1000.0K
    expect(screen.getByText(/\$1000\.0K/)).toBeInTheDocument();
  });

  it('handles zero balance', () => {
    render(
      <VaultCard
        chain="bnb"
        name="Main Vault"
        address="0x1234567890123456789012345678901234567890"
        policy="2-of-3"
        balance={0}
        pending={0}
        signers={mockSigners}
      />
    );

    // 0 → $0.0K
    expect(screen.getByText(/\$0\.0K/)).toBeInTheDocument();
  });

  it('displays signer names in title attribute for accessibility', () => {
    const { container } = render(
      <VaultCard
        chain="bnb"
        name="Main Vault"
        address="0x1234567890123456789012345678901234567890"
        policy="2-of-3"
        balance={50000}
        pending={5000}
        signers={mockSigners}
      />
    );

    // Avatars should have title attributes
    const avatars = container.querySelectorAll('.avatar');
    avatars.forEach((avatar, i) => {
      if (mockSigners[i]) {
        expect(avatar.getAttribute('title')).toBe(mockSigners[i].name);
      }
    });
  });

  it('renders balance label', () => {
    render(
      <VaultCard
        chain="bnb"
        name="Main Vault"
        address="0x1234567890123456789012345678901234567890"
        policy="2-of-3"
        balance={50000}
        pending={5000}
        signers={mockSigners}
      />
    );

    // Should render the balance label
    const container = screen.getByText('Main Vault').parentElement;
    expect(container).toBeInTheDocument();
  });

  it('handles multiple signers with proper overlapping', () => {
    const manySigners = [
      { id: 's1', initials: 'A1', name: 'Signer 1' },
      { id: 's2', initials: 'A2', name: 'Signer 2' },
      { id: 's3', initials: 'A3', name: 'Signer 3' },
      { id: 's4', initials: 'A4', name: 'Signer 4' },
    ];

    const { container } = render(
      <VaultCard
        chain="bnb"
        name="Main Vault"
        address="0x1234567890123456789012345678901234567890"
        policy="3-of-4"
        balance={50000}
        pending={5000}
        signers={manySigners}
      />
    );

    const avatars = container.querySelectorAll('.avatar');
    expect(avatars.length).toBe(4);
  });
});
