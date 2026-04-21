// ColdChainSection — one chain's hot/cold pair with band bar + action buttons.
// Prototype layout: 3-column grid (hot card | arrow buttons | cold card) + advisory banner.
// Data sourced from real GET /cold/balances (aggregated USDT+USDC totals) and
// GET /cold/wallets (band thresholds + vault metadata).
import type { ColdBalanceEntry, ColdWalletMeta } from '@/api/queries';
import { ChainPill } from '@/components/custody/chain-pill';
import { I } from '@/icons';
import { CHAINS } from '@/lib/constants';
import { fmtUSD, shortHash } from '@/lib/format';
import { useTranslation } from 'react-i18next';
import { BandProgressBar } from './band-progress-bar';

interface Props {
  chain: 'bnb' | 'sol';
  /** All balance entries for this chain */
  balanceEntries: ColdBalanceEntry[];
  /** Hot wallet metadata (address, band thresholds) */
  hotMeta: ColdWalletMeta | undefined;
  /** Cold wallet metadata (address, signerLabel, geographicLabel) */
  coldMeta: ColdWalletMeta | undefined;
  canRebalance: boolean;
  /** Open rebalance modal prefilled with a direction */
  onRebalance: (chain: 'bnb' | 'sol', direction: 'hot→cold' | 'cold→hot') => void;
}

/** Sum USDT + USDC balances for a given tier, converting from minor units.
 *  BNB token balances are 18-decimal, Solana SPL are 6-decimal. */
function sumUsd(entries: ColdBalanceEntry[], chain: 'bnb' | 'sol', tier: 'hot' | 'cold'): number {
  const decimals = chain === 'bnb' ? 18 : 6;
  const divisor = 10 ** decimals;
  return entries
    .filter((e) => e.chain === chain && e.tier === tier)
    .reduce((acc, e) => acc + Number(e.balance) / divisor, 0);
}

export function ColdChainSection({
  chain,
  balanceEntries,
  hotMeta,
  coldMeta,
  canRebalance,
  onRebalance,
}: Props) {
  const { t } = useTranslation();

  const hotAddress = hotMeta?.address ?? '';
  const coldAddress = coldMeta?.address ?? '';
  const floorUsd = hotMeta?.bandFloorUsd ?? 0;
  const ceilingUsd = hotMeta?.bandCeilingUsd ?? 0;

  const hotBalanceUsd = sumUsd(balanceEntries, chain, 'hot');
  const coldBalanceUsd = sumUsd(balanceEntries, chain, 'cold');

  const hasBand = floorUsd > 0 && ceilingUsd > 0;
  const overCeiling = hasBand && hotBalanceUsd > ceilingUsd;
  const underFloor = hasBand && hotBalanceUsd < floorUsd;
  const midpoint = hasBand ? (floorUsd + ceilingUsd) / 2 : 0;
  const delta = overCeiling ? hotBalanceUsd - midpoint : underFloor ? midpoint - hotBalanceUsd : 0;

  const chainName = CHAINS[chain]?.name ?? chain.toUpperCase();
  const hotLabel = chain === 'bnb' ? 'BSC HOT WALLET' : 'SOLANA HOT WALLET';
  const coldLabel = chain === 'bnb' ? 'BSC COLD VAULT' : 'SOLANA COLD VAULT';

  return (
    <div className="cold-pair">
      {/* Section header */}
      <div className="cold-pair-head">
        <ChainPill chain={chain} />
        <span className="fw-600">{chainName}</span>
        <span className="spacer" />
        {overCeiling && (
          <span className="badge-tight warn">
            <span className="dot" />
            {t('cold.overCeiling')}
          </span>
        )}
        {underFloor && (
          <span className="badge-tight err">
            <span className="dot" />
            {t('cold.underFloor')}
          </span>
        )}
        {!overCeiling && !underFloor && (
          <span className="badge-tight ok">
            <span className="dot" />
            {t('cold.withinBand')}
          </span>
        )}
      </div>

      {/* 3-column grid: hot | arrows | cold */}
      <div className="cold-pair-wallets">
        {/* Hot wallet card */}
        <div className="cold-wallet hot">
          <div className="cold-wallet-head">
            <I.Lightning size={11} />
            {t('cold.tierHot')} · {hotLabel}
          </div>
          <div className="cold-wallet-value">${fmtUSD(hotBalanceUsd)}</div>
          {hasBand && (
            <BandProgressBar
              balanceUsd={hotBalanceUsd}
              floorUsd={floorUsd}
              ceilingUsd={ceilingUsd}
            />
          )}
        </div>

        {/* Action arrow buttons */}
        <div className="cold-arrow">
          <button
            type="button"
            className="cold-arrow-btn"
            disabled={!canRebalance}
            title={overCeiling ? t('cold.hotToColdHint') : t('cold.withinBandHint')}
            onClick={() => onRebalance(chain, 'hot→cold')}
          >
            <I.ArrowRight size={14} />
            {t('cold.hotToCold')}
          </button>
          <button
            type="button"
            className="cold-arrow-btn reverse"
            disabled={!canRebalance}
            onClick={() => onRebalance(chain, 'cold→hot')}
          >
            <I.ArrowLeft size={14} />
            {t('cold.coldToHot')}
          </button>
        </div>

        {/* Cold wallet card */}
        <div className="cold-wallet cold">
          <div className="cold-wallet-head">
            <I.Lock size={11} />
            {t('cold.tierCold')} · {coldLabel}
          </div>
          <div className="cold-wallet-value">${fmtUSD(coldBalanceUsd)}</div>
          <div className="cold-wallet-meta">
            {coldAddress && (
              <div className="text-xs text-muted text-mono">{shortHash(coldAddress, 8, 6)}</div>
            )}
            {coldMeta?.signerLabel && (
              <div className="text-xs text-faint">{coldMeta.signerLabel}</div>
            )}
            {coldMeta?.geographicLabel && (
              <div className="text-xs text-faint">{coldMeta.geographicLabel}</div>
            )}
          </div>
        </div>
      </div>

      {/* Advisory banner when out of band */}
      {(overCeiling || underFloor) && (
        <div className={`cold-advisory ${overCeiling ? 'warn' : 'err'}`}>
          <I.AlertTri size={11} />
          <span>
            {t('cold.hotIs')} <b>${fmtUSD(Math.abs(delta))}</b>{' '}
            {overCeiling ? t('cold.aboveMidpoint') : t('cold.belowMidpoint')}.{' '}
            {overCeiling ? t('cold.proposeHotToCold') : t('cold.proposeColdToHot')}
          </span>
        </div>
      )}
    </div>
  );
}
