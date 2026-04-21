import { useCeremonies } from '@/api/signer-ceremony-queries';
import { useStaff } from '@/api/signer-ceremony-queries';
import type { CeremonyRow } from '@/api/signers';
// Signers page — real-data wiring replacing fixture-driven prototype.
// Sections: Current treasurers · Active ceremonies · History (paginated).
// Admin-only action buttons: Add / Remove / Rotate.
import { useAuth } from '@/auth/use-auth';
import { PageFrame, Tabs } from '@/components/custody';
import { Sheet } from '@/components/overlays';
import { I } from '@/icons';
import type { StaffMember } from '@wp/shared-types';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BlockTicker } from '../_shared/realtime';
import { AddSignerModal } from './add-signer-modal';
import { CeremonyProgress } from './ceremony-progress';
import { RemoveSignerModal } from './remove-signer-modal';
import { RotateSignersModal } from './rotate-signers-modal';
import { SignersKpiStrip } from './signers-kpi-strip';
import { useSignersSocket } from './use-signers-socket';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'current' | 'active' | 'history';
type ModalKind = 'add' | 'remove' | 'rotate' | null;

// ── Treasurer table ───────────────────────────────────────────────────────────

function TreasurerTable({ staff }: { staff: StaffMember[] }) {
  const { t } = useTranslation();
  const treasurers = staff.filter((s) => s.role === 'treasurer' && s.status === 'active');

  if (treasurers.length === 0) {
    return (
      <div className="text-xs text-muted" style={{ padding: 16 }}>
        {t('common.empty')}
      </div>
    );
  }

  return (
    <table className="table table-tight">
      <thead>
        <tr>
          <th>{t('signers.current.colName')}</th>
          <th>{t('signers.current.colEmail')}</th>
          <th>{t('signers.current.colStatus')}</th>
        </tr>
      </thead>
      <tbody>
        {treasurers.map((s) => (
          <tr key={s.id}>
            <td>
              <div className="hstack" style={{ gap: 8 }}>
                <div className="avatar">{s.name.slice(0, 2).toUpperCase()}</div>
                <span className="text-sm fw-500">{s.name}</span>
              </div>
            </td>
            <td className="text-xs text-muted">{s.email}</td>
            <td>
              <span className="badge-tight ok">
                <span className="dot" />
                {t('signers.status.active')}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Ceremonies section ────────────────────────────────────────────────────────

function ActiveCeremoniesSection() {
  const { t } = useTranslation();
  const { data, isPending } = useCeremonies({ status: 'in_progress', limit: 20 });
  const pending = useCeremonies({ status: 'pending', limit: 20 });

  const rows: CeremonyRow[] = [...(pending.data?.data ?? []), ...(data?.data ?? [])];

  if (isPending || pending.isPending) {
    return (
      <div className="text-xs text-muted" style={{ padding: 16 }}>
        {t('common.loading')}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-xs text-muted" style={{ padding: 16 }}>
        {t('signers.ceremony.noneActive')}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 0' }}>
      {rows.map((c) => (
        <CeremonyProgress key={c.id} ceremony={c} />
      ))}
    </div>
  );
}

function HistorySection() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const { data, isPending } = useCeremonies({ page, limit: 10 });

  // Filter to terminal states
  const rows = (data?.data ?? []).filter(
    (c) =>
      c.status === 'confirmed' ||
      c.status === 'failed' ||
      c.status === 'cancelled' ||
      c.status === 'partial'
  );
  const total = data?.total ?? 0;
  const hasMore = page * 10 < total;

  if (isPending) {
    return (
      <div className="text-xs text-muted" style={{ padding: 16 }}>
        {t('common.loading')}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-xs text-muted" style={{ padding: 16 }}>
        {t('common.empty')}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((c) => (
          <CeremonyProgress key={c.id} ceremony={c} readOnly />
        ))}
      </div>
      {(hasMore || page > 1) && (
        <div className="hstack" style={{ padding: 12, gap: 8 }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <I.ChevronLeft size={12} /> {t('common.back')}
          </button>
          <span className="text-xs text-muted">
            {t('common.of', { current: page, total: Math.ceil(total / 10) })}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={!hasMore}
            onClick={() => setPage((p) => p + 1)}
          >
            {t('common.next')} <I.ChevronRight size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function SignersPage() {
  const { t } = useTranslation();
  const { staff: authStaff } = useAuth();
  const canManage = authStaff?.role === 'admin';

  const [tab, setTab] = useState<Tab>('current');
  const [modal, setModal] = useState<ModalKind>(null);
  const [lastCeremonyId, setLastCeremonyId] = useState<string | null>(null);

  // Live socket updates
  useSignersSocket();

  const { data: staffData = [], isPending: staffLoading } = useStaff();
  const { data: activeCerems } = useCeremonies({ status: 'in_progress', limit: 100 });
  const { data: pendingCerems } = useCeremonies({ status: 'pending', limit: 100 });

  const activeTreasurers = staffData.filter(
    (s: StaffMember) => s.role === 'treasurer' && s.status === 'active'
  );
  const activeCeremCount = (activeCerems?.data?.length ?? 0) + (pendingCerems?.data?.length ?? 0);

  function handleSuccess(ceremonyId: string) {
    setLastCeremonyId(ceremonyId);
    setModal(null);
    setTab('active');
  }

  return (
    <PageFrame
      eyebrow={
        <>
          Governance · <span className="env-inline">{t('signers.subtitle')}</span>
        </>
      }
      title={t('signers.title')}
      policyStrip={
        <div className="policy-strip">
          <div className="policy-strip-item">
            <I.Shield size={11} />
            <span className="text-muted">Policy:</span>
            <span className="fw-600">Signer changes require 2-of-N threshold</span>
          </div>
          <div className="policy-strip-sep" />
          <div className="policy-strip-item">
            <I.Key size={11} />
            <span className="text-muted">Chains:</span>
            <span className="fw-600">BNB Safe + Solana Squads</span>
          </div>
          <div className="spacer" />
          <BlockTicker chain="bnb" />
          <BlockTicker chain="sol" />
        </div>
      }
      actions={
        canManage && (
          <div className="hstack" style={{ gap: 8 }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setModal('remove')}
              title={t('signers.remove.title')}
            >
              <I.UserX size={12} /> {t('signers.remove.title')}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setModal('rotate')}
              title={t('signers.rotate.title')}
            >
              <I.Key size={12} /> {t('signers.rotate.title')}
            </button>
            <button
              type="button"
              className="btn btn-accent"
              onClick={() => setModal('add')}
              title={t('signers.add.title')}
            >
              <I.UserPlus size={13} /> {t('signers.add.title')}
            </button>
          </div>
        )
      }
      kpis={
        <SignersKpiStrip activeCount={activeTreasurers.length} pendingChanges={activeCeremCount} />
      }
    >
      {/* New ceremony banner */}
      {lastCeremonyId && (
        <div className="alert ok" style={{ marginBottom: 12 }}>
          <I.Check size={13} className="alert-icon" />
          <div className="alert-body">
            <div className="alert-title">{t('signers.ceremony.created')}</div>
            <div className="alert-text text-mono">{lastCeremonyId}</div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setLastCeremonyId(null)}
          >
            <I.X size={10} />
          </button>
        </div>
      )}

      <div className="card pro-card" style={{ marginTop: 14 }}>
        <div className="pro-card-header">
          <Tabs
            value={tab}
            onChange={(v) => setTab(v as Tab)}
            embedded
            tabs={[
              {
                value: 'current',
                label: t('signers.current.tabLabel'),
                count: staffLoading ? undefined : activeTreasurers.length,
              },
              {
                value: 'active',
                label: t('signers.ceremony.activeTabLabel'),
                count: activeCeremCount || undefined,
              },
              { value: 'history', label: t('signers.ceremony.historyTabLabel') },
            ]}
          />
        </div>

        {tab === 'current' && <TreasurerTable staff={staffData} />}
        {tab === 'active' && <ActiveCeremoniesSection />}
        {tab === 'history' && <HistorySection />}
      </div>

      {/* Add modal */}
      <Sheet
        open={modal === 'add'}
        onClose={() => setModal(null)}
        title={t('signers.add.title')}
        subtitle={t('signers.add.subtitle')}
      >
        <AddSignerModal onClose={() => setModal(null)} onSuccess={handleSuccess} />
      </Sheet>

      {/* Remove modal */}
      <Sheet
        open={modal === 'remove'}
        onClose={() => setModal(null)}
        title={t('signers.remove.title')}
        subtitle={t('signers.remove.subtitle')}
      >
        <RemoveSignerModal onClose={() => setModal(null)} onSuccess={handleSuccess} />
      </Sheet>

      {/* Rotate modal */}
      <Sheet
        open={modal === 'rotate'}
        onClose={() => setModal(null)}
        title={t('signers.rotate.title')}
        subtitle={t('signers.rotate.subtitle')}
      >
        <RotateSignersModal onClose={() => setModal(null)} onSuccess={handleSuccess} />
      </Sheet>
    </PageFrame>
  );
}
