// Smoke tests for providers/chain-providers.tsx — renders ChainProviders without crashing.
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChainProviders } from '../chain-providers';

vi.mock('../wagmi-provider', () => ({
  WagmiProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="wagmi-provider">{children}</div>
  ),
}));

vi.mock('../solana-provider', () => ({
  SolanaProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="solana-provider">{children}</div>
  ),
}));

describe('ChainProviders', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders without crashing', () => {
    render(
      <ChainProviders>
        <span data-testid="child">content</span>
      </ChainProviders>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('wraps children in WagmiProvider', () => {
    render(
      <ChainProviders>
        <span>inner</span>
      </ChainProviders>
    );
    expect(screen.getByTestId('wagmi-provider')).toBeInTheDocument();
  });

  it('wraps children in SolanaProvider inside WagmiProvider', () => {
    render(
      <ChainProviders>
        <span>inner</span>
      </ChainProviders>
    );
    expect(screen.getByTestId('solana-provider')).toBeInTheDocument();
    // Solana is nested inside Wagmi
    const wagmi = screen.getByTestId('wagmi-provider');
    expect(wagmi).toContainElement(screen.getByTestId('solana-provider'));
  });

  it('passes children through both providers', () => {
    render(
      <ChainProviders>
        <button type="button">click me</button>
      </ChainProviders>
    );
    expect(screen.getByRole('button', { name: 'click me' })).toBeInTheDocument();
  });

  it('renders multiple children', () => {
    render(
      <ChainProviders>
        <span data-testid="child-a">A</span>
        <span data-testid="child-b">B</span>
      </ChainProviders>
    );
    expect(screen.getByTestId('child-a')).toBeInTheDocument();
    expect(screen.getByTestId('child-b')).toBeInTheDocument();
  });
});
