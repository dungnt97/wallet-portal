// Smoke tests for providers/solana-provider.tsx — renders SolanaProvider without crashing.
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@solana/wallet-adapter-react', () => ({
  ConnectionProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="connection-provider">{children}</div>
  ),
  WalletProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="wallet-provider">{children}</div>
  ),
}));

vi.mock('@solana/wallet-adapter-react-ui', () => ({
  WalletModalProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="wallet-modal-provider">{children}</div>
  ),
}));

vi.mock('@solana/wallet-adapter-wallets', () => ({
  PhantomWalletAdapter: vi.fn().mockImplementation(() => ({ name: 'Phantom' })),
  SolflareWalletAdapter: vi.fn().mockImplementation(() => ({ name: 'Solflare' })),
  LedgerWalletAdapter: vi.fn().mockImplementation(() => ({ name: 'Ledger' })),
}));

vi.mock('@solana/web3.js', () => ({
  clusterApiUrl: vi.fn(() => 'https://api.devnet.solana.com'),
}));

// Mock CSS import
vi.mock('@solana/wallet-adapter-react-ui/styles.css', () => ({}));

import { SolanaProvider } from '../solana-provider';

describe('SolanaProvider', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders children without crashing', () => {
    render(
      <SolanaProvider>
        <span data-testid="child">content</span>
      </SolanaProvider>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('wraps children in ConnectionProvider', () => {
    render(
      <SolanaProvider>
        <span>inner</span>
      </SolanaProvider>
    );
    expect(screen.getByTestId('connection-provider')).toBeInTheDocument();
  });

  it('wraps children in WalletProvider', () => {
    render(
      <SolanaProvider>
        <span>inner</span>
      </SolanaProvider>
    );
    expect(screen.getByTestId('wallet-provider')).toBeInTheDocument();
  });

  it('wraps children in WalletModalProvider', () => {
    render(
      <SolanaProvider>
        <span>inner</span>
      </SolanaProvider>
    );
    expect(screen.getByTestId('wallet-modal-provider')).toBeInTheDocument();
  });

  it('nests providers in correct order: Connection > Wallet > Modal', () => {
    render(
      <SolanaProvider>
        <span data-testid="leaf">leaf</span>
      </SolanaProvider>
    );
    const connection = screen.getByTestId('connection-provider');
    const wallet = screen.getByTestId('wallet-provider');
    const modal = screen.getByTestId('wallet-modal-provider');
    expect(connection).toContainElement(wallet);
    expect(wallet).toContainElement(modal);
    expect(modal).toContainElement(screen.getByTestId('leaf'));
  });

  it('passes multiple children through', () => {
    render(
      <SolanaProvider>
        <span data-testid="a">A</span>
        <span data-testid="b">B</span>
      </SolanaProvider>
    );
    expect(screen.getByTestId('a')).toBeInTheDocument();
    expect(screen.getByTestId('b')).toBeInTheDocument();
  });
});
