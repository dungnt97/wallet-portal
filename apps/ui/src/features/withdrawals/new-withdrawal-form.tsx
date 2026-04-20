import { useAuth } from '@/auth/use-auth';
import { Risk, Segmented } from '@/components/custody';
import { Sheet } from '@/components/overlays';
import { I } from '@/icons';
import { CHAINS, MULTISIG_POLICY } from '@/lib/constants';
import { fmtUSD, shortHash } from '@/lib/format';
import { useTweaksStore } from '@/stores/tweaks-store';
// New withdrawal — 2-step form (fields → review) ported from prototype.
// Zod validation kept light-weight because shared-types schema is not yet in UI.
import { useEffect, useState } from 'react';
import { TOTAL_BALANCES } from '../_shared/fixtures';
import type { FixWithdrawal } from '../_shared/fixtures';

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (w: FixWithdrawal) => void;
}

export function NewWithdrawalForm({ open, onClose, onSubmit }: Props) {
  const { staff } = useAuth();
  const showRiskFlags = useTweaksStore((s) => s.showRiskFlags);
  const [chain, setChain] = useState<'bnb' | 'sol'>('bnb');
  const [token, setToken] = useState<'USDT' | 'USDC'>('USDT');
  const [amount, setAmount] = useState('');
  const [destination, setDestination] = useState('');
  const [note, setNote] = useState('');
  const [step, setStep] = useState<1 | 2>(1);

  useEffect(() => {
    if (open) {
      setStep(1);
      setAmount('');
      setDestination('');
      setNote('');
    }
  }, [open]);

  const valid = amount && destination && Number(amount) > 0;
  const riskScore: 'low' | 'med' | null =
    destination.length > 30 && destination.startsWith('0x4')
      ? 'med'
      : destination.length > 0
        ? 'low'
        : null;

  const submit = () => {
    onSubmit({
      id: `wd_${Math.floor(Math.random() * 99999).toString(36)}`,
      chain,
      token,
      amount: Number(amount),
      destination,
      stage: 'awaiting_signatures',
      risk: riskScore || 'low',
      createdAt: new Date().toISOString(),
      requestedBy: staff?.id || 'stf_mira',
      multisig: {
        required: MULTISIG_POLICY.required,
        total: MULTISIG_POLICY.total,
        collected: 0,
        approvers: [],
        rejectedBy: null,
      },
      txHash: null,
      note: note || null,
    });
  };

  const footer =
    step === 1 ? (
      <>
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <div className="spacer" />
        <button className="btn btn-accent" onClick={() => setStep(2)} disabled={!valid}>
          Review
        </button>
      </>
    ) : (
      <>
        <button className="btn btn-ghost" onClick={() => setStep(1)}>
          <I.ChevronLeft size={12} /> Back
        </button>
        <div className="spacer" />
        <button className="btn btn-accent" onClick={submit}>
          Submit to multisig
        </button>
      </>
    );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New withdrawal"
      subtitle={`${MULTISIG_POLICY.required} of ${MULTISIG_POLICY.total} treasurer signatures required`}
      footer={footer}
    >
      {step === 1 ? (
        <>
          <div className="field">
            <span className="field-label">Chain</span>
            <Segmented
              options={[
                { value: 'bnb', label: 'BNB Chain' },
                { value: 'sol', label: 'Solana' },
              ]}
              value={chain}
              onChange={(v) => setChain(v)}
            />
          </div>
          <div className="field">
            <span className="field-label">Asset</span>
            <Segmented
              options={[
                { value: 'USDT', label: 'USDT' },
                { value: 'USDC', label: 'USDC' },
              ]}
              value={token}
              onChange={(v) => setToken(v)}
            />
          </div>
          <div className="field">
            <label htmlFor="wd-amount" className="field-label">
              Amount{' '}
              <span className="text-faint text-xs">
                treasury balance ${fmtUSD(TOTAL_BALANCES[chain][token])}
              </span>
            </label>
            <div className="input-prefix">
              <span className="prefix">$</span>
              <input
                id="wd-amount"
                className="input mono"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <button
                className="input-suffix-btn"
                onClick={() => setAmount(String(TOTAL_BALANCES[chain][token]))}
              >
                MAX
              </button>
            </div>
          </div>
          <div className="field">
            <label htmlFor="wd-destination" className="field-label">
              Destination
            </label>
            <input
              id="wd-destination"
              className="input mono"
              placeholder={chain === 'bnb' ? '0x…' : 'Solana address'}
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            />
            {showRiskFlags && riskScore && (
              <div
                className="field-hint hstack"
                style={{ justifyContent: 'space-between', marginTop: 6 }}
              >
                <span>
                  Address risk: <Risk level={riskScore} />
                </span>
                <span className="text-faint">
                  {riskScore === 'low' ? 'seen before' : 'first seen'}
                </span>
              </div>
            )}
          </div>
          <div className="field">
            <label htmlFor="wd-memo" className="field-label">
              Memo <span className="text-faint">(optional)</span>
            </label>
            <textarea
              id="wd-memo"
              className="textarea"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Internal note (not on chain)"
            />
          </div>
        </>
      ) : (
        <>
          <div className="card" style={{ background: 'var(--bg-sunken)', marginBottom: 16 }}>
            <div style={{ padding: 16 }}>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  letterSpacing: '-0.02em',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {fmtUSD(amount)} <span className="text-muted text-sm fw-500">{token}</span>
              </div>
              <div className="text-xs text-muted" style={{ marginTop: 6 }}>
                to {CHAINS[chain].name} →{' '}
                <span className="text-mono">{shortHash(destination, 8, 6)}</span>
              </div>
            </div>
          </div>
          <dl className="dl">
            <dt>Vault</dt>
            <dd>{chain === 'bnb' ? 'BSC Treasury Safe' : 'Solana Squads Vault'}</dd>
            <dt>Signatures</dt>
            <dd>
              {MULTISIG_POLICY.required} of {MULTISIG_POLICY.total} treasurers
            </dd>
            <dt>Estimated fee</dt>
            <dd className="text-mono">{chain === 'bnb' ? '~0.0014 BNB' : '~0.000006 SOL'}</dd>
          </dl>
          <div className="alert warn" style={{ marginTop: 16 }}>
            <I.AlertTri size={14} className="alert-icon" />
            <div className="alert-body">
              <div className="alert-title">Treasurers will be notified</div>
              <div className="alert-text">
                All active treasurers receive an email + in-app alert to review and sign.
              </div>
            </div>
          </div>
        </>
      )}
    </Sheet>
  );
}
