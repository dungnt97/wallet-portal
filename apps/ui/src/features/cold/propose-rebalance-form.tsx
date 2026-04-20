// Propose rebalance form — sheet body for hot↔cold transfer.
import { I } from '@/icons';
import { fmtUSD } from '@/lib/format';
import { useState } from 'react';
import type { ColdWallet, HotWallet } from './cold-fixtures';

export interface ProposeConfig {
  chain: 'bnb' | 'sol';
  direction: 'hot→cold' | 'cold→hot';
  hot: HotWallet;
  cold: ColdWallet;
  suggested: number;
}

interface Props {
  config: ProposeConfig;
  onSubmit: (payload: {
    chain: 'bnb' | 'sol';
    direction: ProposeConfig['direction'];
    amount: number;
  }) => void;
  onCancel: () => void;
}

export function ProposeRebalanceForm({ config, onSubmit, onCancel }: Props) {
  const [amount, setAmount] = useState(String(config.suggested));
  const valid = Number(amount) > 0;
  const srcLabel = config.direction === 'hot→cold' ? 'Source · Hot' : 'Source · Cold';
  const dstLabel = config.direction === 'hot→cold' ? 'Destination · Cold' : 'Destination · Hot';
  const srcName = config.direction === 'hot→cold' ? config.hot.name : config.cold.name;
  const dstName = config.direction === 'hot→cold' ? config.cold.name : config.hot.name;
  return (
    <>
      <div
        className="card"
        style={{ background: 'var(--bg-sunken)', padding: 14, marginBottom: 14 }}
      >
        <div className="text-xs text-muted">{srcLabel}</div>
        <div className="fw-500">{srcName}</div>
        <div className="text-xs text-muted" style={{ marginTop: 6 }}>
          {dstLabel}
        </div>
        <div className="fw-500">{dstName}</div>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="rebalance-amount">
          Amount (USD equiv)
        </label>
        <div className="input-prefix">
          <span className="prefix">$</span>
          <input
            id="rebalance-amount"
            className="input mono"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <button
            type="button"
            className="input-suffix-btn"
            onClick={() => setAmount(String(config.suggested))}
          >
            SUGGESTED
          </button>
        </div>
        <div className="field-hint">
          Suggested: ${fmtUSD(config.suggested)} to restore band midpoint
        </div>
      </div>
      <div className="alert info" style={{ marginTop: 8 }}>
        <I.Info size={13} className="alert-icon" />
        <div className="alert-body">
          <div className="alert-title">Signing path</div>
          <div className="alert-text">
            {config.direction === 'hot→cold'
              ? 'Hot wallet signs with 2/3 Treasurer keys. Cold vault simply receives.'
              : 'Cold vault signs with 3/5 signers (independent set). Hot receives.'}
          </div>
        </div>
      </div>
      <div className="hstack" style={{ marginTop: 20, gap: 8 }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <div className="spacer" />
        <button
          type="button"
          className="btn btn-accent"
          disabled={!valid}
          onClick={() =>
            onSubmit({
              chain: config.chain,
              direction: config.direction,
              amount: Number(amount),
            })
          }
        >
          Propose rebalance
        </button>
      </div>
    </>
  );
}
