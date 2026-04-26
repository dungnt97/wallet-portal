// Tests for shell/connect-wallet-modal.tsx — EVM + Solana wallet picker modal.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) => (opts ? `${k}:${JSON.stringify(opts)}` : k),
  }),
}));

vi.mock('@/components/overlays', () => ({
  Modal: ({
    open,
    onClose,
    title,
    children,
  }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode }) =>
    open ? (
      <div data-testid="modal">
        <h2>{title}</h2>
        {children}
        <button type="button" data-testid="modal-close" onClick={onClose}>
          X
        </button>
      </div>
    ) : null,
  useToast: () => vi.fn(),
}));

vi.mock('@/features/signing/wallet-marks', () => ({
  WalletMark: ({ kind, size }: { kind: string; size: number }) => (
    <span data-testid={`wallet-mark-${kind}`} data-size={size} />
  ),
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
  shortHash: (h: string, a: number, b: number) => `${h.slice(0, a)}…${h.slice(-b)}`,
}));

vi.mock('@/lib/wallet-errors', () => ({
  classifyConnectError: (err: unknown) =>
    err instanceof Error && err.message === 'cancelled' ? 'cancelled' : 'error',
}));

const mockConnectAsync = vi.fn();
const mockConnectors: Array<{ name: string; uid: string }> = [];
const mockEvmAddress = { current: undefined as string | undefined };

vi.mock('wagmi', () => ({
  useConnect: () => ({ connectors: mockConnectors, connectAsync: mockConnectAsync }),
  useAccount: () => ({ address: mockEvmAddress.current }),
}));

const mockSolSelect = vi.fn();
const mockSolConnect = vi.fn();
const mockSolWallets: Array<{ adapter: { name: string; icon?: string } }> = [];
const mockSolPubKey = { current: null as { toBase58: () => string } | null };

vi.mock('@solana/wallet-adapter-react', () => ({
  useWallet: () => ({
    wallets: mockSolWallets,
    select: mockSolSelect,
    connect: mockSolConnect,
    publicKey: mockSolPubKey.current,
  }),
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import { ConnectWalletModal } from '../connect-wallet-modal';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ConnectWalletModal', () => {
  beforeEach(() => {
    mockConnectors.length = 0;
    mockSolWallets.length = 0;
    mockEvmAddress.current = undefined;
    mockSolPubKey.current = null;
    mockConnectAsync.mockReset();
    mockSolSelect.mockReset();
    mockSolConnect.mockReset();
  });

  it('renders nothing when closed', () => {
    render(<ConnectWalletModal open={false} onClose={vi.fn()} />);
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('renders modal when open', () => {
    render(<ConnectWalletModal open={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });

  it('shows wallet.connect.choose title', () => {
    render(<ConnectWalletModal open={true} onClose={vi.fn()} />);
    expect(screen.getByText('wallet.connect.choose')).toBeInTheDocument();
  });

  it('shows EVM section header', () => {
    render(<ConnectWalletModal open={true} onClose={vi.fn()} />);
    expect(screen.getByText('wallet.connect.evm')).toBeInTheDocument();
  });

  it('shows Solana section header', () => {
    render(<ConnectWalletModal open={true} onClose={vi.fn()} />);
    expect(screen.getByText('wallet.connect.solana')).toBeInTheDocument();
  });

  it('shows no-connectors message when EVM connectors empty', () => {
    render(<ConnectWalletModal open={true} onClose={vi.fn()} />);
    expect(screen.getByText('No EVM connectors configured')).toBeInTheDocument();
  });

  it('shows install-extension message when no solana wallets', () => {
    render(<ConnectWalletModal open={true} onClose={vi.fn()} />);
    expect(screen.getByText('Install Phantom or Solflare extension')).toBeInTheDocument();
  });

  it('renders EVM connector buttons', () => {
    mockConnectors.push({ name: 'MetaMask', uid: 'mm-1' });
    render(<ConnectWalletModal open={true} onClose={vi.fn()} />);
    expect(screen.getByText('MetaMask')).toBeInTheDocument();
  });

  it('renders Solana wallet buttons', () => {
    mockSolWallets.push({ adapter: { name: 'Phantom', icon: '' } });
    render(<ConnectWalletModal open={true} onClose={vi.fn()} />);
    expect(screen.getByText('Phantom')).toBeInTheDocument();
  });

  it('shows EVM connector detail text', () => {
    mockConnectors.push({ name: 'MetaMask', uid: 'mm-1' });
    render(<ConnectWalletModal open={true} onClose={vi.fn()} />);
    expect(screen.getByText('Browser extension · EIP-712')).toBeInTheDocument();
  });

  it('shows WalletConnect detail text', () => {
    mockConnectors.push({ name: 'WalletConnect', uid: 'wc-1' });
    render(<ConnectWalletModal open={true} onClose={vi.fn()} />);
    expect(screen.getByText('QR code · Ledger Live compatible')).toBeInTheDocument();
  });

  it('shows connecting phase after clicking EVM connector', async () => {
    mockConnectors.push({ name: 'MetaMask', uid: 'mm-1' });
    // connectAsync never resolves to stay in connecting state
    mockConnectAsync.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(<ConnectWalletModal open={true} onClose={vi.fn()} />);
    await user.click(screen.getByText('MetaMask').closest('button') as HTMLElement);
    // Title renders as "wallet.connect.connecting:{"name":"MetaMask"}"
    expect(screen.getByText(/wallet\.connect\.connecting:\{/)).toBeInTheDocument();
  });

  it('shows error phase when EVM connection fails', async () => {
    mockConnectors.push({ name: 'MetaMask', uid: 'mm-1' });
    mockConnectAsync.mockRejectedValue(new Error('User rejected'));
    const user = userEvent.setup();
    render(<ConnectWalletModal open={true} onClose={vi.fn()} />);
    await user.click(screen.getByText('MetaMask').closest('button') as HTMLElement);
    expect(await screen.findByText('wallet.connect.error')).toBeInTheDocument();
  });

  it('shows back button in error phase', async () => {
    mockConnectors.push({ name: 'MetaMask', uid: 'mm-1' });
    mockConnectAsync.mockRejectedValue(new Error('Connection failed'));
    const user = userEvent.setup();
    render(<ConnectWalletModal open={true} onClose={vi.fn()} />);
    await user.click(screen.getByText('MetaMask').closest('button') as HTMLElement);
    await screen.findByText('wallet.connect.error');
    expect(screen.getByText('common.back')).toBeInTheDocument();
  });

  it('returns to pick phase when back button clicked in error state', async () => {
    mockConnectors.push({ name: 'MetaMask', uid: 'mm-1' });
    mockConnectAsync.mockRejectedValue(new Error('Connection failed'));
    const user = userEvent.setup();
    render(<ConnectWalletModal open={true} onClose={vi.fn()} />);
    await user.click(screen.getByText('MetaMask').closest('button') as HTMLElement);
    await screen.findByText('wallet.connect.error');
    await user.click(screen.getByText('common.back').closest('button') as HTMLElement);
    expect(screen.getByText('wallet.connect.evm')).toBeInTheDocument();
  });

  it('shows disclaimer text in pick phase', () => {
    render(<ConnectWalletModal open={true} onClose={vi.fn()} />);
    expect(screen.getByText('wallet.connect.disclaimer')).toBeInTheDocument();
  });

  it('calls onClose via modal close button', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ConnectWalletModal open={true} onClose={onClose} />);
    await user.click(screen.getByTestId('modal-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders wallet mark for metamask connector', () => {
    mockConnectors.push({ name: 'MetaMask', uid: 'mm-1' });
    render(<ConnectWalletModal open={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('wallet-mark-metamask')).toBeInTheDocument();
  });

  it('renders WalletMark phantom for Solana wallet without icon', () => {
    mockSolWallets.push({ adapter: { name: 'Phantom' } });
    render(<ConnectWalletModal open={true} onClose={vi.fn()} />);
    expect(screen.getByTestId('wallet-mark-phantom')).toBeInTheDocument();
  });

  it('renders img element when Solana wallet has non-empty icon', () => {
    mockSolWallets.push({ adapter: { name: 'Phantom', icon: 'data:image/png;base64,abc' } });
    render(<ConnectWalletModal open={true} onClose={vi.fn()} />);
    const img = document.querySelector('img[alt="Phantom"]') as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toContain('abc');
  });

  it('shows connected-evm phase after EVM connectAsync resolves', async () => {
    mockConnectors.push({ name: 'MetaMask', uid: 'mm-1' });
    mockConnectAsync.mockResolvedValue({
      accounts: ['0xabcdef1234567890abcdef1234567890abcdef12'],
    });
    const user = userEvent.setup();
    render(<ConnectWalletModal open={true} onClose={vi.fn()} />);
    await user.click(screen.getByText('MetaMask').closest('button') as HTMLElement);
    expect(await screen.findByText('wallet.connect.connected')).toBeInTheDocument();
  });

  it('shows shortened EVM address in connected-evm phase', async () => {
    mockConnectors.push({ name: 'MetaMask', uid: 'mm-1' });
    mockConnectAsync.mockResolvedValue({
      accounts: ['0xabcdef1234567890abcdef1234567890abcdef12'],
    });
    const user = userEvent.setup();
    render(<ConnectWalletModal open={true} onClose={vi.fn()} />);
    await user.click(screen.getByText('MetaMask').closest('button') as HTMLElement);
    // shortHash mock: ${h.slice(0,8)}…${h.slice(-6)}
    await screen.findByText('wallet.connect.connected');
    expect(document.querySelector('.wallet-verified-addr')).toBeInTheDocument();
  });
});
