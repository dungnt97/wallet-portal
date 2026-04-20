// Cold/hot wallet pair card — band indicator + rebalance arrows.
import { ChainPill } from '@/components/custody';
import { I } from '@/icons';
import { CHAINS } from '@/lib/constants';
import { fmtUSD, shortHash } from '@/lib/format';
import type { ColdWallet, HotWallet } from '../_shared/fixtures';

interface Props {
  hot: HotWallet;
  cold: ColdWallet;
  canPropose: boolean;
  onPropose: (p: {
    chain: 'bnb' | 'sol';
    direction: 'hot→cold' | 'cold→hot';
    hot: HotWallet;
    cold: ColdWallet;
    suggested: number;
  }) => void;
}

export function ColdPairCard({ hot, cold, canPropose, onPropose }: Props) {
  const pct = Math.min(100, (hot.balanceUsd / hot.targetCeiling) * 100);
  const overCeiling = hot.balanceUsd > hot.targetCeiling;
  const underFloor = hot.balanceUsd < hot.targetFloor;
  const midpoint = (hot.targetFloor + hot.targetCeiling) / 2;
  const delta = overCeiling
    ? hot.balanceUsd - midpoint
    : underFloor
      ? midpoint - hot.balanceUsd
      : 0;

  return (
    <div className="cold-pair">
      <div className="cold-pair-head">
        <ChainPill chain={hot.chain} />
        <span className="fw-600">{CHAINS[hot.chain].name}</span>
        <span className="spacer" />
        {overCeiling && (
          <span className="badge-tight warn">
            <span className="dot" />
            Over ceiling
          </span>
        )}
        {underFloor && (
          <span className="badge-tight err">
            <span className="dot" />
            Under floor
          </span>
        )}
        {!overCeiling && !underFloor && (
          <span className="badge-tight ok">
            <span className="dot" />
            Within band
          </span>
        )}
      </div>

      <div className="cold-pair-wallets">
        <div className="cold-wallet hot">
          <div className="cold-wallet-head">
            <I.Lightning size={11} /> Hot · {hot.name}
          </div>
          <div className="cold-wallet-value">${fmtUSD(hot.balanceUsd)}</div>
          <div className="cold-wallet-band">
            <div className="cold-band-track">
              <div
                className="cold-band-floor"
                style={{ left: `${(hot.targetFloor / hot.targetCeiling) * 100 * 0.8}%` }}
              />
              <div className="cold-band-ceiling" style={{ left: '80%' }} />
              <div
                className="cold-band-fill"
                style={{
                  width: `${Math.min(100, pct * 0.8)}%`,
                  background: overCeiling ? 'var(--warn)' : underFloor ? 'var(--err)' : 'var(--ok)',
                }}
              />
              <div className="cold-band-marker" style={{ left: `${Math.min(100, pct * 0.8)}%` }} />
            </div>
            <div className="cold-band-labels">
              <span>Floor ${(hot.targetFloor / 1000).toFixed(0)}K</span>
              <span>Ceiling ${(hot.targetCeiling / 1000).toFixed(0)}K</span>
            </div>
          </div>
        </div>

        <div className="cold-arrow">
          <button
            type="button"
            className="cold-arrow-btn"
            disabled={!overCeiling || !canPropose}
            onClick={() =>
              onPropose({
                chain: hot.chain,
                direction: 'hot→cold',
                hot,
                cold,
                suggested: overCeiling ? Math.round(delta) : 0,
              })
            }
            title={overCeiling ? 'Move excess to cold' : 'Hot is within band'}
          >
            <I.ArrowRight size={14} /> hot→cold
          </button>
          <button
            type="button"
            className="cold-arrow-btn reverse"
            disabled={!underFloor || !canPropose}
            onClick={() =>
              onPropose({
                chain: hot.chain,
                direction: 'cold→hot',
                hot,
                cold,
                suggested: underFloor ? Math.round(delta) : 0,
              })
            }
          >
            <I.ArrowLeft size={14} /> cold→hot
          </button>
        </div>

        <div className="cold-wallet cold">
          <div className="cold-wallet-head">
            <I.Lock size={11} /> Cold · {cold.name}
          </div>
          <div className="cold-wallet-value">${fmtUSD(cold.balanceUsd)}</div>
          <div className="cold-wallet-meta">
            <div className="text-xs text-muted text-mono">{shortHash(cold.address, 8, 6)}</div>
            <div className="text-xs text-faint">{cold.type}</div>
            <div className="text-xs text-faint">{cold.geographic}</div>
          </div>
        </div>
      </div>

      {(overCeiling || underFloor) && (
        <div className={`cold-advisory ${overCeiling ? 'warn' : 'err'}`}>
          <I.AlertTri size={11} />
          <span>
            Hot is <b>${fmtUSD(Math.abs(delta))}</b>
            {overCeiling ? ' above' : ' below'} midpoint.
            {overCeiling
              ? ' Propose hot→cold transfer to restore band.'
              : ' Treasury may need cold→hot refill.'}
          </span>
        </div>
      )}
    </div>
  );
}
