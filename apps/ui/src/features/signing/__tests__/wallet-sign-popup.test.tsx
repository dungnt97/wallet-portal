// Smoke tests for wallet-sign-popup.tsx
// Covers: renders null when closed/no-op, idle UI with sign/reject buttons,
// no-wallet state when chain wallet missing, expand/collapse typed data,
// brand label by walletKind, BNB vs SOL chain label.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) => (opts?.chain ? `${k}:${opts.chain}` : k),
  }),
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
  shortHash: (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`,
}));

const {
  mockEvmAddress,
  mockEvmConnected,
  mockSignTypedDataAsync,
  mockSolPubKey,
  mockSolConnected,
  mockSolSignMessage,
  mockSolWallet,
  mockConnection,
} = vi.hoisted(() => ({
  mockEvmAddress: vi.fn<[], string | undefined>(() => '0xDeadBeef00001234'),
  mockEvmConnected: vi.fn<[], boolean>(() => true),
  mockSignTypedDataAsync: vi.fn(),
  mockSolPubKey: vi.fn(() => null),
  mockSolConnected: vi.fn<[], boolean>(() => false),
  mockSolSignMessage: vi.fn(),
  mockSolWallet: vi.fn(() => null),
  mockConnection: vi.fn(() => ({ getLatestBlockhash: vi.fn() })),
}));

vi.mock('wagmi', () => ({
  useAccount: () => ({
    address: mockEvmAddress(),
    isConnected: mockEvmConnected(),
  }),
  useSignTypedData: () => ({
    signTypedDataAsync: mockSignTypedDataAsync,
  }),
}));

vi.mock('@solana/wallet-adapter-react', () => ({
  useWallet: () => ({
    publicKey: mockSolPubKey(),
    connected: mockSolConnected(),
    signMessage: mockSolSignMessage,
    wallet: mockSolWallet(),
  }),
  useConnection: () => ({
    connection: mockConnection(),
  }),
}));

vi.mock('../signing-flow', () => ({
  IS_DEV_MODE: true,
  mockSign: vi
    .fn()
    .mockResolvedValue({ signer: '0xmock', signature: '0xsig', at: '2024-01-01T00:00:00Z' }),
  makeBroadcastResult: vi.fn(() => ({ hash: '0xabc', blockNumber: 1, confirmedAt: '2024-01-01' })),
}));

vi.mock('../evm-adapter', () => ({
  evmSign: vi.fn(),
  evmBroadcastViaSafe: vi.fn(),
  getSafeTxServiceUrl: vi.fn(() => 'https://safe.test/api'),
}));

vi.mock('../evm-safe-tx-builder', () => ({
  buildEvmSafeTxTypedData: vi.fn(),
}));

vi.mock('../solana-adapter', () => ({
  getSquadsMultisigPda: vi.fn(() => null),
  solanaProposeSquads: vi.fn(),
  solanaSign: vi.fn(),
}));

vi.mock('../solana-transfer-builder', () => ({
  buildSolanaTransferInstruction: vi.fn(),
}));

vi.mock('../wallet-marks', () => ({
  WalletMark: ({ kind, size }: { kind: string; size?: number }) => (
    <span data-testid={`wallet-mark-${kind}`} data-size={size} />
  ),
}));

// ── Import after mocks ─────────────────────────────────────────────────────────

import type { SigningOp } from '../signing-flow-types';
import { WalletSignPopup } from '../wallet-sign-popup';

// ── Helpers ───────────────────────────────────────────────────────────────────

const BNB_OP: SigningOp = {
  id: 'op-001',
  chain: 'bnb',
  token: 'USDT',
  amount: 1000,
  destination: '0xDeadBeef00001234',
  signaturesRequired: 2,
  totalSigners: 3,
  sourceTier: 'hot',
  withdrawalId: 'wd-001',
  safeAddress: '0xSafe00001234',
  nonce: 5,
};

const SOL_OP: SigningOp = {
  ...BNB_OP,
  id: 'op-002',
  chain: 'sol',
  destination: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe8bXo',
};

function renderPopup(props: Partial<Parameters<typeof WalletSignPopup>[0]> = {}) {
  return render(
    <WalletSignPopup
      open={true}
      op={BNB_OP}
      onSigned={vi.fn()}
      onRejected={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WalletSignPopup', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders null when open=false', () => {
    const { container } = renderPopup({ open: false });
    expect(container.firstChild).toBeNull();
  });

  it('renders null when op=null', () => {
    const { container } = renderPopup({ op: null });
    expect(container.firstChild).toBeNull();
  });

  it('renders sign and reject buttons in idle state', () => {
    renderPopup();
    expect(screen.getByText('signing.sign')).toBeInTheDocument();
    expect(screen.getByText('signing.reject')).toBeInTheDocument();
  });

  it('shows MetaMask brand for bnb chain with default walletKind', () => {
    renderPopup();
    expect(screen.getByText('MetaMask')).toBeInTheDocument();
    expect(screen.getByTestId('wallet-mark-metamask')).toBeInTheDocument();
  });

  it('shows Ledger Live brand for ledger walletKind', () => {
    renderPopup({ walletKind: 'ledger' });
    expect(screen.getByText('Ledger Live')).toBeInTheDocument();
  });

  it('shows WalletConnect brand for walletconnect walletKind', () => {
    renderPopup({ walletKind: 'walletconnect' });
    expect(screen.getByText('WalletConnect')).toBeInTheDocument();
  });

  it('shows Phantom brand for SOL chain regardless of walletKind', () => {
    renderPopup({ op: SOL_OP });
    expect(screen.getByText('Phantom')).toBeInTheDocument();
    expect(screen.getByTestId('wallet-mark-phantom')).toBeInTheDocument();
  });

  it('shows BNB Testnet chain label for bnb op', () => {
    renderPopup();
    expect(screen.getByText('BNB Testnet')).toBeInTheDocument();
  });

  it('shows Solana Devnet chain label for sol op', () => {
    renderPopup({ op: SOL_OP });
    expect(screen.getByText('Solana Devnet')).toBeInTheDocument();
  });

  it('renders treasury signer and address', () => {
    renderPopup();
    expect(screen.getByText('signing.treasurySigner')).toBeInTheDocument();
  });

  it('renders signature request title', () => {
    renderPopup();
    expect(screen.getByText('signing.signatureRequest')).toBeInTheDocument();
  });

  it('shows collapsed view-raw-data toggle by default', () => {
    renderPopup();
    expect(screen.getByText('signing.viewRawData')).toBeInTheDocument();
  });

  it('expands typed data when toggle clicked', async () => {
    const user = userEvent.setup();
    renderPopup();
    await user.click(screen.getByText('signing.viewRawData'));
    // collapse text appears after expansion
    expect(screen.getByText('signing.collapse')).toBeInTheDocument();
  });

  it('collapses back when toggle clicked again', async () => {
    const user = userEvent.setup();
    renderPopup();
    await user.click(screen.getByText('signing.viewRawData'));
    await user.click(screen.getByText('signing.collapse'));
    expect(screen.getByText('signing.viewRawData')).toBeInTheDocument();
  });

  it('calls onRejected when reject button clicked', async () => {
    const onRejected = vi.fn();
    const user = userEvent.setup();
    renderPopup({ onRejected });
    await user.click(screen.getByText('signing.reject'));
    expect(onRejected).toHaveBeenCalledOnce();
  });

  it('shows no-wallet connect UI when EVM wallet missing', () => {
    mockEvmConnected.mockReturnValue(false);
    mockEvmAddress.mockReturnValue(undefined);
    renderPopup({ op: BNB_OP });
    // connectWalletRequired with chain label
    expect(screen.getByText(/signing.connectWalletRequired/)).toBeInTheDocument();
  });

  it('shows connect-wallet button in no-wallet state', () => {
    mockEvmConnected.mockReturnValue(false);
    mockEvmAddress.mockReturnValue(undefined);
    renderPopup({ op: BNB_OP });
    expect(screen.getByText('signing.connectWallet')).toBeInTheDocument();
  });

  it('calls onNeedConnect when connect-wallet button clicked in no-wallet state', async () => {
    mockEvmConnected.mockReturnValue(false);
    mockEvmAddress.mockReturnValue(undefined);
    const onNeedConnect = vi.fn();
    const user = userEvent.setup();
    renderPopup({ op: BNB_OP, onNeedConnect });
    await user.click(screen.getByText('signing.connectWallet'));
    expect(onNeedConnect).toHaveBeenCalledOnce();
  });

  it('shows cancel button in no-wallet state that calls onRejected', async () => {
    mockEvmConnected.mockReturnValue(false);
    mockEvmAddress.mockReturnValue(undefined);
    const onRejected = vi.fn();
    const user = userEvent.setup();
    renderPopup({ op: BNB_OP, onRejected });
    await user.click(screen.getByText('signing.cancel'));
    expect(onRejected).toHaveBeenCalledOnce();
  });

  it('shows SOL connect hint text for sol chain no-wallet state', () => {
    mockSolConnected.mockReturnValue(false);
    renderPopup({ op: SOL_OP });
    expect(screen.getByText('signing.connectWalletHintSol')).toBeInTheDocument();
  });

  it('shows EVM connect hint text for bnb chain no-wallet state', () => {
    mockEvmConnected.mockReturnValue(false);
    mockEvmAddress.mockReturnValue(undefined);
    renderPopup({ op: BNB_OP });
    expect(screen.getByText('signing.connectWalletHintEvm')).toBeInTheDocument();
  });
});
