// ConnectWalletModal — lists EVM + Solana wallets for connection.
// Ported from prototype overlays.jsx ConnectWalletModal.
// Uses wagmi useConnect for EVM, @solana/wallet-adapter-react useWallet for Solana.
import { Modal, useToast } from '@/components/overlays';
import { WalletMark } from '@/features/signing/wallet-marks';
import { I } from '@/icons';
import { shortHash } from '@/lib/format';
import { useWallet as useSolanaWallet } from '@solana/wallet-adapter-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAccount as useWagmiAccount, useConnect as useWagmiConnect } from 'wagmi';
import type { Connector } from 'wagmi';

interface Props {
  open: boolean;
  onClose: () => void;
}

type ConnectPhase = 'pick' | 'connecting' | 'connected-evm' | 'connected-sol' | 'error';

// Metadata for known EVM connectors
const EVM_WALLET_META: Record<
  string,
  { kind: 'metamask' | 'walletconnect' | 'ledger'; detail: string }
> = {
  MetaMask: { kind: 'metamask', detail: 'Browser extension · EIP-712' },
  WalletConnect: { kind: 'walletconnect', detail: 'QR code · Ledger Live compatible' },
  'Coinbase Wallet': { kind: 'walletconnect', detail: 'Coinbase smart wallet' },
};

// Solana wallet display metadata
const SOL_WALLET_META: Record<string, { detail: string }> = {
  Phantom: { detail: 'Browser extension · Ed25519' },
  Solflare: { detail: 'Browser extension · Solflare' },
  Ledger: { detail: 'Hardware wallet · Ledger Live' },
};

export function ConnectWalletModal({ open, onClose }: Props) {
  const { t } = useTranslation();
  const push = useToast();

  // EVM
  const { connectors, connectAsync } = useWagmiConnect();
  const { address: evmAddress } = useWagmiAccount();

  // Solana
  const {
    wallets,
    select: solSelect,
    connect: solConnect,
    publicKey: solPubKey,
  } = useSolanaWallet();

  const [phase, setPhase] = useState<ConnectPhase>('pick');
  const [connectingName, setConnectingName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Reset on open
  useEffect(() => {
    if (open) {
      setPhase('pick');
      setErrorMsg('');
    }
  }, [open]);

  async function handleEvmConnect(connector: Connector) {
    setConnectingName(connector.name);
    setPhase('connecting');
    try {
      const result = await connectAsync({ connector });
      push(
        t('wallet.connect.connectedAs', { address: shortHash(result.accounts[0] ?? '', 8, 6) }),
        'success'
      );
      setPhase('connected-evm');
      setTimeout(onClose, 1200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection failed';
      setErrorMsg(msg);
      setPhase('error');
    }
  }

  async function handleSolConnect(walletName: string) {
    setConnectingName(walletName);
    setPhase('connecting');
    try {
      // WalletName is a branded string from @solana/wallet-adapter-base (transitive dep).
      // Cast is safe: wallet names come directly from the adapter registry.
      solSelect(walletName as Parameters<typeof solSelect>[0]);
      // solConnect() picks up the just-selected wallet synchronously on next microtask
      await solConnect();
      const addr = solPubKey?.toBase58() ?? '';
      push(t('wallet.connect.connectedAs', { address: shortHash(addr, 8, 6) }), 'success');
      setPhase('connected-sol');
      setTimeout(onClose, 1200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Solana connection failed';
      setErrorMsg(msg);
      setPhase('error');
    }
  }

  const evmConnectors = connectors.filter((c) => c.name !== 'Injected');

  return (
    <Modal open={open} onClose={onClose} title={t('wallet.connect.choose')}>
      <div className="connect-modal">
        {phase === 'pick' && (
          <>
            {/* EVM section */}
            <div style={{ padding: '0 12px 8px' }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--text-faint)',
                  marginBottom: 8,
                  marginTop: 12,
                }}
              >
                {t('wallet.connect.evm')}
              </div>
              <div className="wallet-picker">
                {evmConnectors.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>
                    No EVM connectors configured
                  </div>
                )}
                {evmConnectors.map((c) => {
                  const meta = EVM_WALLET_META[c.name] ?? {
                    kind: 'metamask' as const,
                    detail: c.name,
                  };
                  return (
                    <button
                      key={c.uid}
                      className="wallet-pick-btn"
                      onClick={() => void handleEvmConnect(c)}
                    >
                      <WalletMark kind={meta.kind} size={32} />
                      <div className="wallet-pick-text">
                        <div className="wallet-pick-name">{c.name}</div>
                        <div className="wallet-pick-detail">{meta.detail}</div>
                      </div>
                      <I.ChevronRight size={14} style={{ color: 'var(--text-faint)' }} />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Solana section */}
            <div style={{ padding: '0 12px 12px' }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--text-faint)',
                  marginBottom: 8,
                }}
              >
                {t('wallet.connect.solana')}
              </div>
              <div className="wallet-picker">
                {wallets.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>
                    Install Phantom or Solflare extension
                  </div>
                )}
                {wallets.map((w) => {
                  const meta = SOL_WALLET_META[w.adapter.name] ?? { detail: w.adapter.name };
                  return (
                    <button
                      key={w.adapter.name}
                      className="wallet-pick-btn"
                      onClick={() => void handleSolConnect(w.adapter.name)}
                    >
                      {w.adapter.icon ? (
                        <img
                          src={w.adapter.icon}
                          alt={w.adapter.name}
                          width={32}
                          height={32}
                          style={{ borderRadius: 8 }}
                        />
                      ) : (
                        <WalletMark kind="phantom" size={32} />
                      )}
                      <div className="wallet-pick-text">
                        <div className="wallet-pick-name">{w.adapter.name}</div>
                        <div className="wallet-pick-detail">{meta.detail}</div>
                      </div>
                      <I.ChevronRight size={14} style={{ color: 'var(--text-faint)' }} />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="wallet-picker-foot">
              <I.AlertTri size={11} />
              {t('wallet.connect.disclaimer')}
            </div>
          </>
        )}

        {phase === 'connecting' && (
          <div className="wallet-connecting">
            <div className="wallet-connecting-mark">
              <div className="wallet-pulse" />
              <WalletMark kind="metamask" size={48} />
            </div>
            <div className="wallet-connecting-title">
              {t('wallet.connect.connecting', { name: connectingName })}
            </div>
            <div className="wallet-connecting-sub">{t('wallet.connect.connectingHint')}</div>
          </div>
        )}

        {(phase === 'connected-evm' || phase === 'connected-sol') && (
          <div className="wallet-verified">
            <div className="wallet-verified-check">
              <I.Check size={28} />
            </div>
            <div className="wallet-verified-title">{t('wallet.connect.connected')}</div>
            <div className="wallet-verified-addr text-mono">
              {phase === 'connected-evm'
                ? shortHash(evmAddress ?? '', 8, 6)
                : shortHash(solPubKey?.toBase58() ?? '', 8, 6)}
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div
            style={{
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              alignItems: 'center',
            }}
          >
            <div style={{ color: 'var(--err)', fontSize: 14, fontWeight: 600 }}>
              {t('wallet.connect.error')}
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-muted)',
                textAlign: 'center',
                maxWidth: 280,
              }}
            >
              {errorMsg}
            </div>
            <button className="btn btn-ghost" onClick={() => setPhase('pick')}>
              {t('common.back')}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
