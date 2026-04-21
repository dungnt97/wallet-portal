// Wallet sign popup — drives real EIP-712 (wagmi) or Ed25519 (wallet-adapter) signing.
// Falls back to mock when VITE_AUTH_DEV_MODE=true.
//
// C3 fix: EVM path now uses evmBuildSafeTx (protocol-kit) to produce the real
//         SafeTxData + safeTxHash before signing. Value/data/nonce are correct.
// C4 fix: Solana path builds real SPL/SOL transfer instruction; missing PDA
//         throws instead of silently returning a fake hash.
import { I } from '@/icons';
import { shortHash } from '@/lib/format';
import {
  useConnection as useSolanaConnection,
  useWallet as useSolanaWallet,
} from '@solana/wallet-adapter-react';
import { useEffect, useState } from 'react';
import { useSignTypedData, useAccount as useWagmiAccount } from 'wagmi';
import { evmBroadcastViaSafe, evmSign, getSafeTxServiceUrl } from './evm-adapter';
import { buildEvmSafeTxTypedData } from './evm-safe-tx-builder';
import {
  IS_DEV_MODE,
  type SignedSignature,
  type SigningOp,
  makeBroadcastResult,
  mockSign,
} from './signing-flow';
import type { BroadcastResult } from './signing-flow-types';
import { getSquadsMultisigPda, solanaProposeSquads, solanaSign } from './solana-adapter';
import { buildSolanaTransferInstruction } from './solana-transfer-builder';
import { type WalletKind, WalletMark } from './wallet-marks';

interface Props {
  open: boolean;
  op: SigningOp | null;
  walletKind?: WalletKind;
  onSigned: (sig: SignedSignature) => void;
  onRejected: () => void;
  onClose: () => void;
  /** Called with real broadcast result in non-dev mode after signing succeeds. */
  onBroadcastComplete?: (result: BroadcastResult) => void;
  /** Called when real broadcast fails in non-dev mode. */
  onBroadcastFailed?: (error: string) => void;
  /** Called when wallet is not connected for the required chain. */
  onNeedConnect?: () => void;
}

type SignStatus = 'idle' | 'signing' | 'done' | 'no-wallet';

export function WalletSignPopup({
  open,
  op,
  walletKind = 'metamask',
  onSigned,
  onRejected,
  onClose,
  onBroadcastComplete,
  onBroadcastFailed,
  onNeedConnect,
}: Props) {
  const [status, setStatus] = useState<SignStatus>('idle');
  const [expanded, setExpanded] = useState(false);

  // EVM context
  const { address: evmAddress, isConnected: evmConnected } = useWagmiAccount();
  const { signTypedDataAsync } = useSignTypedData();

  // Solana context
  const {
    publicKey: solPubKey,
    connected: solConnected,
    signMessage: solSignMessage,
    wallet: solWallet,
  } = useSolanaWallet();
  const { connection } = useSolanaConnection();

  const needsEvm = op?.chain === 'bnb';
  const needsSol = op?.chain === 'sol';
  const walletMissing = (needsEvm && !evmConnected) || (needsSol && !solConnected);

  useEffect(() => {
    if (open) {
      setStatus(walletMissing ? 'no-wallet' : 'idle');
      setExpanded(false);
    }
  }, [open, walletMissing]);

  if (!open || !op) return null;

  const resolvedKind: WalletKind = op.chain === 'sol' ? 'phantom' : walletKind;
  const brand =
    resolvedKind === 'metamask'
      ? 'MetaMask'
      : resolvedKind === 'phantom'
        ? 'Phantom'
        : resolvedKind === 'ledger'
          ? 'Ledger Live'
          : 'WalletConnect';

  const chainLabel = op.chain === 'sol' ? 'Solana Devnet' : 'BNB Testnet';
  const signerAddress =
    op.chain === 'sol'
      ? (solPubKey?.toBase58() ?? op.safeAddress ?? '')
      : (evmAddress ?? op.safeAddress ?? '');

  const typedMessage = {
    to: op.destination,
    token: op.token,
    amount: op.amount,
    nonce: op.nonce ?? 0,
    safe: op.safeAddress,
  };

  async function sign() {
    if (!op) return;
    setStatus('signing');

    try {
      if (IS_DEV_MODE) {
        const result = await mockSign(op);
        setStatus('done');
        setTimeout(() => {
          onSigned(result);
          onClose();
        }, 480);
        return;
      }

      if (op.chain === 'bnb') {
        if (!evmAddress) throw new Error('EVM wallet not connected');

        const safeAddress = (op.safeAddress ?? import.meta.env.VITE_SAFE_ADDRESS_BNB_TESTNET) as
          | string
          | undefined;
        if (!safeAddress) {
          throw new Error(
            'Safe address not configured. Set VITE_SAFE_ADDRESS_BNB_TESTNET or pass op.safeAddress.'
          );
        }

        // C3 fix: build real Safe tx via protocol-kit; gets correct nonce, value, data
        const { safeTxHash, typedData } = await buildEvmSafeTxTypedData({
          safeAddress: safeAddress as `0x${string}`,
          op,
        });

        // Cast: wagmi overloaded type is not directly assignable; runtime shape matches
        const evmResult = await evmSign(
          { typedData, fromAddress: evmAddress as `0x${string}` },
          signTypedDataAsync as (args: unknown) => Promise<`0x${string}`>
        );

        const signed: SignedSignature = {
          signer: evmResult.signer,
          signature: evmResult.signature,
          at: evmResult.signedAt.toISOString(),
        };

        setStatus('done');

        setTimeout(() => {
          onSigned(signed);
          onClose();
          void (async () => {
            try {
              const SafeApiKit = (await import('@safe-global/api-kit')).default;
              const apiKit = new SafeApiKit({
                txServiceUrl: getSafeTxServiceUrl(),
                chainId: BigInt(97),
              });
              // C3 fix: use the real safeTxHash (keccak256 of SafeTx message), not signature
              const broadcastResult = await evmBroadcastViaSafe(
                {
                  safeAddress: safeAddress as `0x${string}`,
                  safeTxHash,
                  signatures: [{ signer: evmResult.signer, data: evmResult.signature }],
                },
                apiKit
              );
              onBroadcastComplete?.(makeBroadcastResult(broadcastResult.txHash));
            } catch (err) {
              const msg = err instanceof Error ? err.message : 'Broadcast failed';
              console.error('[wallet-sign-popup] EVM broadcast error:', msg);
              onBroadcastFailed?.(msg);
            }
          })();
        }, 480);
      } else if (op.chain === 'sol') {
        if (!solPubKey || !solSignMessage || !solWallet?.adapter) {
          throw new Error('Solana wallet not connected');
        }

        // C4 fix: reject if PDA not configured — do NOT fake success
        const multisigPda = getSquadsMultisigPda();
        if (!multisigPda) {
          throw new Error(
            'Squads not configured: VITE_SQUADS_MULTISIG_PDA_DEVNET is not set. ' +
              'Contact your administrator.'
          );
        }

        const msgBytes = new TextEncoder().encode(
          JSON.stringify({
            id: op.id,
            chain: op.chain,
            amount: op.amount,
            destination: op.destination,
            nonce: op.nonce ?? 0,
          })
        );

        const solResult = await solanaSign({ message: msgBytes }, solSignMessage);

        const signed: SignedSignature = {
          signer: solPubKey.toBase58(),
          signature: Buffer.from(solResult.signature).toString('base64'),
          at: solResult.signedAt.toISOString(),
        };

        setStatus('done');

        setTimeout(() => {
          onSigned(signed);
          onClose();
          void (async () => {
            try {
              // C4 fix: build real transfer instruction for the proposal
              const transferIx = buildSolanaTransferInstruction({
                op,
                fromPubkey: solPubKey,
              });

              const { TransactionMessage } = await import('@solana/web3.js');
              const txMsg = new TransactionMessage({
                payerKey: solPubKey,
                recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
                instructions: [transferIx],
              });

              const proposeResult = await solanaProposeSquads(
                { multisigPda, creator: solPubKey, transactionMessage: txMsg, memo: op.id },
                connection,
                solWallet.adapter
              );
              onBroadcastComplete?.(makeBroadcastResult(proposeResult.signature));
            } catch (err) {
              const msg = err instanceof Error ? err.message : 'Squads propose failed';
              console.error('[wallet-sign-popup] Solana broadcast error:', msg);
              onBroadcastFailed?.(msg);
            }
          })();
        }, 480);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Signing failed';
      setStatus('idle');
      console.error('[wallet-sign-popup] sign error:', msg);
    }
  }

  return (
    <div className="wallet-popup-scrim">
      <div className={`wallet-popup wallet-popup-${resolvedKind}`} role="dialog" aria-modal="true">
        <div className="wallet-popup-chrome">
          <WalletMark kind={resolvedKind} size={24} />
          <span className="wallet-popup-brand">{brand}</span>
          <span className="spacer" />
          <span className="wallet-popup-net">
            <span className="dot" />
            {chainLabel}
          </span>
        </div>

        {status === 'no-wallet' ? (
          <div
            style={{
              padding: '24px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              alignItems: 'center',
            }}
          >
            <I.AlertTri size={28} style={{ color: 'oklch(75% 0.18 70)' }} />
            <div className="wallet-popup-title" style={{ textAlign: 'center' }}>
              Please connect a {op.chain === 'bnb' ? 'BNB' : 'Solana'} wallet
            </div>
            <div className="wallet-popup-sub" style={{ textAlign: 'center' }}>
              This transaction requires a{' '}
              {op.chain === 'bnb' ? 'MetaMask / WalletConnect' : 'Phantom / Solflare'} connection.
            </div>
            <div className="wallet-popup-foot" style={{ borderTop: 'none', padding: 0 }}>
              <button className="btn btn-primary" onClick={onNeedConnect}>
                Connect wallet
              </button>
              <button className="btn btn-ghost" onClick={onRejected}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="wallet-popup-acct">
              <div
                className="wallet-popup-avatar"
                style={{
                  background: `linear-gradient(135deg, #${signerAddress.slice(2, 8).padEnd(6, 'a')}, #${signerAddress.slice(-6).padStart(6, '5')})`,
                }}
              />
              <div>
                <div className="wallet-popup-acct-name">Treasury Signer</div>
                <div className="wallet-popup-acct-addr text-mono">
                  {shortHash(signerAddress, 8, 6)}
                </div>
              </div>
            </div>

            <div className="wallet-popup-body">
              <div className="wallet-popup-title">Signature request</div>
              <div className="wallet-popup-sub">
                Wallet-Portal is requesting a signature for a{' '}
                {op.chain === 'sol' ? 'Squads proposal' : 'Safe transaction'}.{' '}
                <strong>This is off-chain</strong> — no gas, no network fee.
              </div>

              <div className="wallet-popup-data">
                <button
                  type="button"
                  className="wallet-popup-data-head"
                  onClick={() => setExpanded((v) => !v)}
                >
                  <span className="text-xs fw-600">
                    {op.chain === 'sol' ? 'Proposal' : 'SafeTx'}
                  </span>
                  <span className="spacer" />
                  <span className="text-xs text-faint">
                    Click to {expanded ? 'collapse' : 'view raw data'}
                  </span>
                  <I.ArrowRight
                    size={11}
                    style={{
                      transform: expanded ? 'rotate(90deg)' : 'rotate(0)',
                      transition: 'transform 120ms',
                    }}
                  />
                </button>
                {expanded ? (
                  <pre className="wallet-popup-typed">{JSON.stringify(typedMessage, null, 2)}</pre>
                ) : (
                  <div className="wallet-popup-summary">
                    {Object.entries(typedMessage)
                      .slice(0, 4)
                      .map(([k, v]) => (
                        <div key={k} className="wallet-popup-sum-row">
                          <span className="wallet-popup-sum-k">{k}</span>
                          <span className="wallet-popup-sum-v text-mono text-xs">
                            {String(v).length > 30 ? shortHash(String(v), 10, 6) : String(v)}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>

            <div className="wallet-popup-foot">
              {status === 'idle' && (
                <>
                  <button className="btn btn-ghost" onClick={onRejected}>
                    Reject
                  </button>
                  <button className="btn btn-primary" onClick={() => void sign()}>
                    Sign
                  </button>
                </>
              )}
              {status === 'signing' && (
                <div className="wallet-popup-signing">
                  <I.Loader size={14} />
                  <span>Signing…</span>
                </div>
              )}
              {status === 'done' && (
                <div className="wallet-popup-done">
                  <I.Check size={16} />
                  <span>Signed</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
