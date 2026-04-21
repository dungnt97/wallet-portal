// WalletWidget — topbar status pill showing connected EVM + Solana wallets.
// Disconnected: "Connect wallet" button → opens ConnectWalletModal.
// Connected: shows address chip(s) + chain pill + dropdown with disconnect.
// Ported from prototype shell.jsx WalletWidget + web3.jsx wallet context.
import { I } from '@/icons';
import { shortHash } from '@/lib/format';
import { useWallet as useSolanaWallet } from '@solana/wallet-adapter-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAccount as useWagmiAccount, useDisconnect as useWagmiDisconnect } from 'wagmi';
import { ConnectWalletModal } from './connect-wallet-modal';

export function WalletWidget() {
  const { t } = useTranslation();

  // EVM
  const { address: evmAddress, isConnected: evmConnected, chain } = useWagmiAccount();
  const { disconnect: evmDisconnect } = useWagmiDisconnect();

  // Solana
  const {
    publicKey: solPubKey,
    connected: solConnected,
    disconnect: solDisconnect,
  } = useSolanaWallet();

  const anyConnected = evmConnected || solConnected;

  const [modalOpen, setModalOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close panel on outside click
  useEffect(() => {
    if (!panelOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [panelOpen]);

  if (!anyConnected) {
    return (
      <>
        <button
          className="wallet-widget"
          onClick={() => setModalOpen(true)}
          title={t('topbar.connectWallet')}
        >
          <I.Link size={13} />
          <span className="wallet-widget-label">{t('topbar.connectWallet')}</span>
        </button>
        <ConnectWalletModal open={modalOpen} onClose={() => setModalOpen(false)} />
      </>
    );
  }

  const evmShort = evmAddress ? shortHash(evmAddress, 6, 4) : null;
  const solShort = solPubKey ? shortHash(solPubKey.toBase58(), 6, 4) : null;
  const chainName = chain?.name ?? 'BNB Testnet';

  return (
    <div className="wallet-widget-wrap" ref={panelRef}>
      <button
        className="wallet-widget connected"
        onClick={() => setPanelOpen((o) => !o)}
        title={t('topbar.walletStatus')}
      >
        <div className="wallet-widget-chains">
          {evmConnected && (
            <span className="wallet-widget-chip ok">{chainName.slice(0, 3).toUpperCase()}</span>
          )}
          {solConnected && <span className="wallet-widget-chip ok">SOL</span>}
        </div>
        <span className="wallet-widget-label">{evmShort ?? solShort}</span>
        {evmConnected && solConnected && <span className="wallet-widget-add">+1</span>}
        <I.ChevronDown size={11} style={{ color: 'var(--text-faint)', marginLeft: 2 }} />
      </button>

      {panelOpen && (
        <div className="wallet-widget-panel">
          <div className="wallet-widget-panel-head">
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {t('topbar.walletStatus')}
            </span>
            <button
              className="icon-btn"
              style={{ width: 22, height: 22, fontSize: 11 }}
              onClick={() => {
                setModalOpen(true);
                setPanelOpen(false);
              }}
              title={t('wallet.connect.choose')}
            >
              <I.Plus size={11} />
            </button>
          </div>

          {evmConnected && evmAddress && (
            <div className="wallet-chain-row">
              <div className="wallet-chain-head">
                <span className="chain-dot bnb" />
                <span style={{ fontSize: 11, fontWeight: 600 }}>{chainName}</span>
              </div>
              <div className="wallet-chain-body">
                <div className="wallet-chain-row-wallet">
                  <I.Link size={12} style={{ color: 'var(--text-faint)' }} />
                  <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', flex: 1 }}>
                    {shortHash(evmAddress, 10, 8)}
                  </span>
                </div>
                <div className="wallet-chain-actions">
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      navigator.clipboard.writeText(evmAddress).catch(() => void 0);
                    }}
                  >
                    <I.Copy size={11} />
                    {t('common.copy')}
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{ color: 'var(--err)' }}
                    onClick={() => {
                      evmDisconnect();
                      setPanelOpen(false);
                    }}
                  >
                    {t('topbar.disconnect')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {solConnected && solPubKey && (
            <div className="wallet-chain-row">
              <div className="wallet-chain-head">
                <span className="chain-dot sol" />
                <span style={{ fontSize: 11, fontWeight: 600 }}>Solana Devnet</span>
              </div>
              <div className="wallet-chain-body">
                <div className="wallet-chain-row-wallet">
                  <I.Link size={12} style={{ color: 'var(--text-faint)' }} />
                  <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', flex: 1 }}>
                    {shortHash(solPubKey.toBase58(), 10, 8)}
                  </span>
                </div>
                <div className="wallet-chain-actions">
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      navigator.clipboard.writeText(solPubKey.toBase58()).catch(() => void 0);
                    }}
                  >
                    <I.Copy size={11} />
                    {t('common.copy')}
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{ color: 'var(--err)' }}
                    onClick={() => {
                      void solDisconnect();
                      setPanelOpen(false);
                    }}
                  >
                    {t('topbar.disconnect')}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="wallet-widget-foot">
            <I.AlertTri size={11} />
            {t('wallet.connect.footNote')}
          </div>
        </div>
      )}

      <ConnectWalletModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
