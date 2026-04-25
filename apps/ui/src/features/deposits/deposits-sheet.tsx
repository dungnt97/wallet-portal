import { ApiError } from '@/api/client';
import { useAddDepositToSweep } from '@/api/queries';
import { ChainPill, Risk, StatusBadge, TokenPill } from '@/components/custody';
import { DetailSheet, useToast } from '@/components/overlays';
// Deposit detail side-sheet — lifecycle timeline + details definition list.
import { I } from '@/icons';
import { CHAINS } from '@/lib/constants';
import { fmtDateTime, fmtUSD } from '@/lib/format';
import { useTweaksStore } from '@/stores/tweaks-store';
import { useTranslation } from 'react-i18next';
import { explorerUrl } from '../_shared/helpers';
import type { FixDeposit } from './deposit-types';

interface Props {
  deposit: FixDeposit | null;
  onClose: () => void;
}

export function DepositSheet({ deposit, onClose }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const showRiskFlags = useTweaksStore((s) => s.showRiskFlags);
  const addToSweepMutation = useAddDepositToSweep(deposit?.id ?? '');
  if (!deposit) return null;
  const d = deposit;

  return (
    <DetailSheet
      open={!!deposit}
      onClose={onClose}
      title={t('deposits.sheetTitle', { id: d.id })}
      subtitle={`${d.token} · ${CHAINS[d.chain].name}`}
      footer={
        <>
          <a
            className="btn btn-ghost"
            href={explorerUrl(d.chain, d.txHash)}
            target="_blank"
            rel="noreferrer"
          >
            <I.External size={13} /> {t('deposits.viewExplorer')}
          </a>
          <div className="spacer" />
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('deposits.close')}
          </button>
          {d.status === 'credited' && (
            <button
              type="button"
              className="btn btn-accent"
              disabled={addToSweepMutation.isPending}
              onClick={() => {
                addToSweepMutation.mutate(undefined, {
                  onSuccess: () => {
                    toast('Added to sweep queue.', 'success');
                    onClose();
                  },
                  onError: (err) => {
                    const msg = err instanceof ApiError ? err.message : String(err);
                    toast(`Failed to add to sweep: ${msg}`, 'error');
                  },
                });
              }}
            >
              {addToSweepMutation.isPending ? '…' : t('deposits.addToSweep')}
            </button>
          )}
        </>
      }
    >
      <div
        className="hstack"
        style={{ marginBottom: 20, justifyContent: 'space-between', alignItems: 'flex-start' }}
      >
        <div>
          <div className="text-xs text-muted">{t('deposits.amount')}</div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 600,
              letterSpacing: '-0.02em',
              fontVariantNumeric: 'tabular-nums',
              marginTop: 2,
            }}
          >
            {fmtUSD(d.amount)} <span className="text-muted text-sm fw-500">{d.token}</span>
          </div>
          <div className="text-xs text-muted text-mono" style={{ marginTop: 2 }}>
            ≈ ${fmtUSD(d.amount)} USD {/* fmtUSD already formats, label is decorative */}
          </div>
        </div>
        <StatusBadge status={d.status} />
      </div>

      <h4 className="section-head">{t('deposits.lifecycle')}</h4>
      <div className="timeline" style={{ marginBottom: 20 }}>
        <div className="timeline-item">
          <div className="timeline-dot ok" />
          <div className="timeline-content">
            <div className="timeline-title">{t('deposits.tlDetected')}</div>
            <div className="timeline-meta">
              {t('deposits.tlBlock')} {d.blockNumber.toLocaleString()} · {fmtDateTime(d.detectedAt)}
            </div>
          </div>
        </div>
        <div className="timeline-item">
          <div className={`timeline-dot ${d.status === 'pending' ? 'pending' : 'ok'}`} />
          <div className="timeline-content">
            <div className="timeline-title">
              {t('deposits.tlConfs', { a: d.confirmations, b: d.requiredConfirmations })}
            </div>
            <div className="timeline-meta">
              {d.status === 'pending' ? t('deposits.tlWaiting') : t('deposits.tlFinalized')}
            </div>
          </div>
        </div>
        <div className="timeline-item">
          <div className={`timeline-dot ${d.creditedAt ? 'ok' : ''}`} />
          <div className="timeline-content">
            <div className="timeline-title">{t('deposits.tlCredited')}</div>
            <div className="timeline-meta">{d.creditedAt ? fmtDateTime(d.creditedAt) : '—'}</div>
          </div>
        </div>
        <div className="timeline-item">
          <div className={`timeline-dot ${d.sweptAt ? 'ok' : ''}`} />
          <div className="timeline-content">
            <div className="timeline-title">{t('deposits.tlSwept')}</div>
            <div className="timeline-meta">
              {d.sweptAt ? fmtDateTime(d.sweptAt) : t('deposits.tlAwaitingSweep')}
            </div>
          </div>
        </div>
      </div>

      <h4 className="section-head">{t('deposits.details')}</h4>
      <dl className="dl">
        <dt>{t('deposits.dDepositId')}</dt>
        <dd className="text-mono">{d.id}</dd>
        <dt>{t('deposits.dUser')}</dt>
        <dd>
          {d.userName} <span className="text-faint text-mono text-xs">{d.userId}</span>
        </dd>
        <dt>{t('deposits.dChain')}</dt>
        <dd>
          <ChainPill chain={d.chain} /> {CHAINS[d.chain].name}
        </dd>
        <dt>{t('deposits.dAsset')}</dt>
        <dd>
          <TokenPill token={d.token} />
        </dd>
        <dt>{t('deposits.cToAddr')}</dt>
        <dd className="text-mono text-xs">{d.address}</dd>
        <dt>{t('deposits.dTxHash')}</dt>
        <dd className="text-mono text-xs" style={{ wordBreak: 'break-all' }}>
          {d.txHash}
        </dd>
        <dt>{t('deposits.dBlock')}</dt>
        <dd className="text-mono">{d.blockNumber.toLocaleString()}</dd>
        {showRiskFlags && (
          <>
            <dt>{t('deposits.dRisk')}</dt>
            <dd>
              <Risk level={d.risk} />
            </dd>
          </>
        )}
      </dl>
    </DetailSheet>
  );
}
