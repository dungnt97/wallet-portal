// Tests for shell/wallet-widget.tsx — topbar wallet connection status pill.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('@/icons', () => ({
  I: new Proxy(
    {},
    {
      get:
        (_t, key) =>
        ({ size, style }: { size?: number; style?: object }) => (
          <span data-testid={`icon-${String(key)}`} data-size={size} />
        ),
    }
  ),
}));

vi.mock('@/lib/format', () => ({
  shortHash: (h: string, a: number, b: number) => `${h.slice(0, a)}...${h.slice(-b)}`,
}));

const mockEvmDisconnect = vi.fn();
const mockSolDisconnect = vi.fn();

let mockEvmConnected = false;
let mockEvmAddress: string | undefined;
let mockChain: { name: string } | undefined;
let mockSolConnected = false;
let mockSolPubKey: { toBase58: () => string } | null = null;

vi.mock('wagmi', () => ({
  useAccount: () => ({
    address: mockEvmAddress,
    isConnected: mockEvmConnected,
    chain: mockChain,
  }),
  useDisconnect: () => ({ disconnect: mockEvmDisconnect }),
}));

vi.mock('@solana/wallet-adapter-react', () => ({
  useWallet: () => ({
    publicKey: mockSolPubKey,
    connected: mockSolConnected,
    disconnect: mockSolDisconnect,
  }),
}));

// Mock at the path relative to wallet-widget.tsx's location
vi.mock('/Users/dungngo97/Documents/wallet-portal/apps/ui/src/shell/connect-wallet-modal', () => ({
  ConnectWalletModal: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div data-testid="connect-wallet-modal">
        <button type="button" onClick={onClose}>
          close-modal
        </button>
      </div>
    ) : null,
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { WalletWidget } from '../wallet-widget';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WalletWidget — disconnected state', () => {
  beforeEach(() => {
    mockEvmConnected = false;
    mockEvmAddress = undefined;
    mockChain = undefined;
    mockSolConnected = false;
    mockSolPubKey = null;
  });

  it('shows connect wallet button when not connected', () => {
    render(<WalletWidget />);
    expect(screen.getByTitle('topbar.connectWallet')).toBeInTheDocument();
  });

  it('shows connect wallet label text', () => {
    render(<WalletWidget />);
    expect(screen.getByText('topbar.connectWallet')).toBeInTheDocument();
  });

  it('does not show wallet modal by default', () => {
    render(<WalletWidget />);
    expect(screen.queryByTestId('connect-wallet-modal')).not.toBeInTheDocument();
  });

  it('opens connect wallet modal when button clicked', async () => {
    const user = userEvent.setup();
    render(<WalletWidget />);
    await user.click(screen.getByTitle('topbar.connectWallet'));
    expect(screen.getByTestId('connect-wallet-modal')).toBeInTheDocument();
  });

  it('closes modal when modal onClose is called', async () => {
    const user = userEvent.setup();
    render(<WalletWidget />);
    await user.click(screen.getByTitle('topbar.connectWallet'));
    await user.click(screen.getByText('close-modal'));
    expect(screen.queryByTestId('connect-wallet-modal')).not.toBeInTheDocument();
  });
});

describe('WalletWidget — EVM connected state', () => {
  beforeEach(() => {
    mockEvmConnected = true;
    mockEvmAddress = '0xabcdef1234567890abcdef';
    mockChain = { name: 'BNB Testnet' };
    mockSolConnected = false;
    mockSolPubKey = null;
  });

  it('shows EVM chain chip (first 3 chars of chain name)', () => {
    render(<WalletWidget />);
    // "BNB Testnet".slice(0,3).toUpperCase() = "BNB"
    expect(screen.getByText('BNB')).toBeInTheDocument();
  });

  it('shows connected wallet button with wallet-status title', () => {
    render(<WalletWidget />);
    expect(screen.getByTitle('topbar.walletStatus')).toBeInTheDocument();
  });

  it('does not show panel by default', () => {
    render(<WalletWidget />);
    expect(screen.queryByText('topbar.disconnect')).not.toBeInTheDocument();
  });

  it('shows panel on wallet button click', async () => {
    const user = userEvent.setup();
    render(<WalletWidget />);
    await user.click(screen.getByTitle('topbar.walletStatus'));
    expect(screen.getByText('topbar.disconnect')).toBeInTheDocument();
  });

  it('calls evmDisconnect when disconnect clicked', async () => {
    const user = userEvent.setup();
    render(<WalletWidget />);
    await user.click(screen.getByTitle('topbar.walletStatus'));
    await user.click(screen.getByText('topbar.disconnect'));
    expect(mockEvmDisconnect).toHaveBeenCalled();
  });

  it('shows chain name in panel', async () => {
    const user = userEvent.setup();
    render(<WalletWidget />);
    await user.click(screen.getByTitle('topbar.walletStatus'));
    expect(screen.getByText('BNB Testnet')).toBeInTheDocument();
  });

  it('shows Solana section for Solana Devnet when solana connected', async () => {
    mockSolConnected = true;
    mockSolPubKey = { toBase58: () => 'So1anaPublicKey111111111111' };
    const user = userEvent.setup();
    render(<WalletWidget />);
    await user.click(screen.getByTitle('topbar.walletStatus'));
    expect(screen.getByText('Solana Devnet')).toBeInTheDocument();
  });

  it('shows +1 when both EVM and Solana connected', () => {
    mockSolConnected = true;
    mockSolPubKey = { toBase58: () => 'So1anaPublicKey111111111111' };
    render(<WalletWidget />);
    expect(screen.getByText('+1')).toBeInTheDocument();
  });
});

describe('WalletWidget — Solana only connected state', () => {
  beforeEach(() => {
    mockEvmConnected = false;
    mockEvmAddress = undefined;
    mockChain = undefined;
    mockSolConnected = true;
    mockSolPubKey = { toBase58: () => 'SolanaKey12345678901234567890' };
  });

  it('shows SOL chip when solana connected', () => {
    render(<WalletWidget />);
    expect(screen.getByText('SOL')).toBeInTheDocument();
  });

  it('shows wallet status title', () => {
    render(<WalletWidget />);
    expect(screen.getByTitle('topbar.walletStatus')).toBeInTheDocument();
  });
});
