// Reconciliation page — live snapshot list, drift drilldown, timeline, manual trigger.
// Replaces the fixture-based prototype with real API data via TanStack Query.
import { PageFrame } from '@/components/custody';
import { Modal, useToast } from '@/components/overlays';
import { DriftDrilldown } from '@/features/reconciliation/drift-drilldown';
import { DriftTimelineChart } from '@/features/reconciliation/drift-timeline-chart';
import { SnapshotList } from '@/features/reconciliation/snapshot-list';
import {
  useSnapshotDetail,
  useSnapshotList,
  useTriggerSnapshot,
} from '@/features/reconciliation/use-reconciliation';
import { I } from '@/icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ReconPolicyStrip } from './recon-policy-strip';

export function ReconPage() {
  const { t } = useTranslation();
  const toast = useToast();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [triggerScope, setTriggerScope] = useState<'all' | 'hot' | 'cold' | 'users'>('all');
  const [triggerChain, setTriggerChain] = useState<'' | 'bnb' | 'sol'>('');

  const { data: listData, isLoading: listLoading } = useSnapshotList(1);
  const { data: detailData, isLoading: detailLoading } = useSnapshotDetail(selectedId);
  const triggerMutation = useTriggerSnapshot();

  const snapshots = listData?.data ?? [];
  const isRunning = snapshots.some((s) => s.status === 'running');

  const handleTrigger = () => {
    triggerMutation.mutate(
      {
        scope: triggerScope,
        ...(triggerChain ? { chain: triggerChain } : {}),
      },
      {
        onSuccess: () => {
          toast(t('recon.runStarted', 'Reconciliation snapshot enqueued'), 'success');
          setTriggerOpen(false);
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : 'Failed to start reconciliation';
          toast(msg, 'error');
          setTriggerOpen(false);
        },
      }
    );
  };

  return (
    <PageFrame
      eyebrow={
        <>
          Compliance · <span className="env-inline">{t('recon.subtitle')}</span>
        </>
      }
      title={t('recon.title')}
      policyStrip={<ReconPolicyStrip />}
      actions={
        <button
          className="btn btn-secondary"
          onClick={() => setTriggerOpen(true)}
          disabled={isRunning || triggerMutation.isPending}
        >
          <I.Refresh size={12} />
          {isRunning ? 'Running…' : t('recon.runRecon', 'Run scan now')}
        </button>
      }
    >
      {/* Timeline chart — all completed snapshots */}
      {snapshots.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <DriftTimelineChart snapshots={snapshots} />
        </div>
      )}

      {/* Two-panel layout: list (left) + detail (right) */}
      <div
        style={{ display: 'grid', gridTemplateColumns: selectedId ? '1fr 1.4fr' : '1fr', gap: 14 }}
      >
        <div>
          {listLoading ? (
            <div className="card pro-card" style={{ padding: 24 }}>
              <p className="text-muted text-sm">Loading snapshots…</p>
            </div>
          ) : (
            <SnapshotList
              snapshots={snapshots}
              selectedId={selectedId}
              onSelect={(id) => setSelectedId((prev) => (prev === id ? null : id))}
            />
          )}
        </div>

        {selectedId && (
          <div>
            {detailLoading || !detailData ? (
              <div className="card pro-card" style={{ padding: 24 }}>
                <p className="text-muted text-sm">Loading drift details…</p>
              </div>
            ) : (
              <DriftDrilldown snapshot={detailData.snapshot} drifts={detailData.drifts} />
            )}
          </div>
        )}
      </div>

      {/* Manual trigger modal */}
      <Modal
        open={triggerOpen}
        title="Run reconciliation snapshot"
        onClose={() => setTriggerOpen(false)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 320 }}>
          <div>
            <label className="label-sm" htmlFor="recon-scope">
              Scope
            </label>
            <select
              id="recon-scope"
              className="input-sm"
              value={triggerScope}
              onChange={(e) => setTriggerScope(e.target.value as typeof triggerScope)}
            >
              <option value="all">All (hot + cold + users)</option>
              <option value="hot">Hot safes only</option>
              <option value="cold">Cold safes only</option>
              <option value="users">User addresses only</option>
            </select>
          </div>
          <div>
            <label className="label-sm" htmlFor="recon-chain">
              Chain (optional)
            </label>
            <select
              id="recon-chain"
              className="input-sm"
              value={triggerChain}
              onChange={(e) => setTriggerChain(e.target.value as typeof triggerChain)}
            >
              <option value="">All chains</option>
              <option value="bnb">BNB Chain</option>
              <option value="sol">Solana</option>
            </select>
          </div>
          <div className="modal-actions">
            <button
              className="btn btn-secondary"
              onClick={() => setTriggerOpen(false)}
              disabled={triggerMutation.isPending}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleTrigger}
              disabled={triggerMutation.isPending}
            >
              {triggerMutation.isPending ? 'Enqueueing…' : 'Run now'}
            </button>
          </div>
        </div>
      </Modal>
    </PageFrame>
  );
}
