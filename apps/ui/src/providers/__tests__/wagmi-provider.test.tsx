// Smoke tests for providers/wagmi-provider.tsx — renders WagmiProvider without crashing.
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock wagmi before importing the provider
vi.mock('wagmi', () => ({
  WagmiProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="base-wagmi-provider">{children}</div>
  ),
  createConfig: vi.fn(() => ({ chains: [], connectors: [], transports: {} })),
  http: vi.fn(() => ({})),
}));

vi.mock('wagmi/connectors', () => ({
  metaMask: vi.fn(() => ({ id: 'metaMask' })),
  walletConnect: vi.fn(() => ({ id: 'walletConnect' })),
  coinbaseWallet: vi.fn(() => ({ id: 'coinbaseWallet' })),
}));

vi.mock('viem/chains', () => ({
  bscTestnet: { id: 97, name: 'BSC Testnet' },
}));

import { WagmiProvider, wagmiConfig } from '../wagmi-provider';

describe('WagmiProvider', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders children without crashing', () => {
    render(
      <WagmiProvider>
        <span data-testid="child">hello</span>
      </WagmiProvider>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('wraps children in the base wagmi provider', () => {
    render(
      <WagmiProvider>
        <span>inner</span>
      </WagmiProvider>
    );
    expect(screen.getByTestId('base-wagmi-provider')).toBeInTheDocument();
  });

  it('passes multiple children through', () => {
    render(
      <WagmiProvider>
        <span data-testid="a">A</span>
        <span data-testid="b">B</span>
      </WagmiProvider>
    );
    expect(screen.getByTestId('a')).toBeInTheDocument();
    expect(screen.getByTestId('b')).toBeInTheDocument();
  });

  it('exports wagmiConfig', () => {
    expect(wagmiConfig).toBeDefined();
  });
});
