// Recovery page — lists stuck/failed txs from GET /recovery/stuck, allows gas bump
// and cancel-replace. Falls back to fixture data when API returns empty (dev mode).
// Real-time updates via Socket.io; 30s polling as fallback.
import { PageFrame } from '@/components/custody';
import { I } from '@/icons';
import type { StuckTxItem } from '@wp/shared-types';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BlockTicker } from '../_shared/realtime';
import { BumpConfirmModal } from './bump-confirm-modal';
import { CancelConfirmModal } from './cancel-confirm-modal';
import { StuckTxTable } from './stuck-tx-table';
import { useStuckTxs } from './use-recovery';
import { useRecoverySocket } from './use-recovery-socket';

export function RecoveryPage() {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = useStuckTxs();

  // Wire Socket.io invalidation + toast on confirmed/failed events
  useRecoverySocket();

  const [bumpTarget, setBumpTarget] = useState<StuckTxItem | null>(null);
  const [cancelTarget, setCancelTarget] = useState<StuckTxItem | null>(null);

  const items = data?.items ?? [];
  const thresholds = data?.thresholdsUsed;

  return (
    <PageFrame
      eyebrow={
        <>
          Ops · <span className="env-inline">{t('recovery.subtitle')}</span>
        </>
      }
      title={t('recovery.title')}
      policyStrip={
        <div className="policy-strip">
          <div className="policy-strip-item">
            <I.AlertTri size={11} />
            <span className="text-muted">{t('recovery.stuck')}:</span>
            <span className="fw-600">{isLoading ? '…' : items.length} tx</span>
          </div>
          {thresholds && (
            <>
              <div className="policy-strip-sep" />
              <div className="policy-strip-item">
                <I.Clock size={11} />
                <span className="text-muted">EVM &gt;</span>
                <span className="fw-600">{thresholds.evmMinutes}m</span>
              </div>
              <div className="policy-strip-sep" />
              <div className="policy-strip-item">
                <I.Clock size={11} />
                <span className="text-muted">SOL &gt;</span>
                <span className="fw-600">{thresholds.solanaSeconds}s</span>
              </div>
            </>
          )}
          <div className="spacer" />
          <BlockTicker chain="bnb" />
          <BlockTicker chain="sol" />
        </div>
      }
    >
      {isError && (
        <div className="alert err" style={{ marginTop: 14 }}>
          <I.AlertTri size={14} className="alert-icon" />
          <div className="alert-body">
            <div className="alert-title">{t('recovery.loadError')}</div>
            <button className="btn btn-ghost btn-sm" onClick={() => void refetch()}>
              {t('common.retry')}
            </button>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="card" style={{ padding: 40, marginTop: 14, textAlign: 'center' }}>
          <div className="text-muted text-sm">{t('common.loading')}</div>
        </div>
      )}

      {!isLoading && !isError && (
        <StuckTxTable
          items={items}
          onBump={(item) => setBumpTarget(item)}
          onCancel={(item) => setCancelTarget(item)}
        />
      )}

      {/* Bump modal */}
      <BumpConfirmModal
        open={bumpTarget !== null}
        item={bumpTarget}
        onClose={() => setBumpTarget(null)}
      />

      {/* Cancel modal */}
      <CancelConfirmModal
        open={cancelTarget !== null}
        item={cancelTarget}
        onClose={() => setCancelTarget(null)}
      />
    </PageFrame>
  );
}
