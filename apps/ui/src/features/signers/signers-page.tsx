// Signers page — Treasurer roster + pending changes + change history.
// Ports prototype page_signers.jsx (split across several files).
import { useAuth } from '@/auth/use-auth';
import { PageFrame, Tabs } from '@/components/custody';
import { Sheet } from '@/components/overlays';
import { I } from '@/icons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ACTIVE_SIGNERS, RETIRED_SIGNERS, type SignerRow } from '../_shared/fixtures';
import { BlockTicker } from '../_shared/realtime';
import { AddSignerForm } from './add-signer-form';
import { RemoveSignerForm } from './remove-signer-form';
import { RotateKeyForm } from './rotate-key-form';
import { SignerChangeRequests } from './signers-change-requests';
import { SignerSetHealth, SignersKpiStrip } from './signers-kpi-strip';
import { ActiveSignersTable, ChangeHistoryTable, RetiredSignersTable } from './signers-tables';
import { useSignerChanges } from './use-signer-changes';

type Tab = 'active' | 'retired' | 'history';

export function SignersPage() {
  const { t } = useTranslation();
  const { staff } = useAuth();
  const canManage = staff?.role === 'admin';
  const [tab, setTab] = useState<Tab>('active');
  const [proposeOpen, setProposeOpen] = useState(false);
  const [rotateSigner, setRotateSigner] = useState<SignerRow | null>(null);
  const [removeSigner, setRemoveSigner] = useState<SignerRow | null>(null);
  const { activeChanges, history, sign, proposeAdd, proposeRotate, proposeRemove } =
    useSignerChanges();

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
            <span className="fw-600">Signer changes themselves need 2/3</span>
          </div>
          <div className="policy-strip-sep" />
          <div className="policy-strip-item">
            <I.Key size={11} />
            <span className="text-muted">Key custody:</span>
            <span className="fw-600">Ledger HW · per-signer</span>
          </div>
          <div className="policy-strip-sep" />
          <div className="policy-strip-item">
            <I.Clock size={11} />
            <span className="text-muted">Time-lock:</span>
            <span className="fw-600">48h before activation</span>
          </div>
          <div className="spacer" />
          <BlockTicker chain="bnb" />
          <BlockTicker chain="sol" />
        </div>
      }
      actions={
        <button
          type="button"
          className="btn btn-accent"
          disabled={!canManage}
          title={!canManage ? 'Admin only' : ''}
          onClick={() => setProposeOpen(true)}
        >
          {canManage ? <I.UserPlus size={13} /> : <I.Lock size={13} />} Propose new Treasurer
        </button>
      }
      kpis={<SignersKpiStrip active={ACTIVE_SIGNERS} pendingChanges={activeChanges.length} />}
    >
      <SignerChangeRequests
        requests={activeChanges}
        currentStaffId={staff?.id}
        currentRole={staff?.role}
        onSign={sign}
      />

      <div className="card pro-card" style={{ marginTop: 14 }}>
        <div className="pro-card-header">
          <Tabs
            value={tab}
            onChange={(v) => setTab(v as Tab)}
            embedded
            tabs={[
              { value: 'active', label: 'Active signers', count: ACTIVE_SIGNERS.length },
              { value: 'retired', label: 'Retired', count: RETIRED_SIGNERS.length },
              { value: 'history', label: 'Change history', count: history.length },
            ]}
          />
          <div className="spacer" />
          <span className="text-xs text-muted">Each signer's wallet is registered per-chain</span>
        </div>

        {tab === 'active' && (
          <ActiveSignersTable
            rows={ACTIVE_SIGNERS}
            onRotate={setRotateSigner}
            onRemove={setRemoveSigner}
          />
        )}
        {tab === 'retired' && <RetiredSignersTable rows={RETIRED_SIGNERS} />}
        {tab === 'history' && <ChangeHistoryTable rows={history} />}
      </div>

      <SignerSetHealth active={ACTIVE_SIGNERS} />

      <Sheet
        open={proposeOpen}
        onClose={() => setProposeOpen(false)}
        title="Propose new Treasurer"
        subtitle="Will require 2 existing Treasurers to approve · 48h time-lock"
      >
        <AddSignerForm
          onSubmit={(p) => {
            proposeAdd(p);
            setProposeOpen(false);
          }}
          onCancel={() => setProposeOpen(false)}
        />
      </Sheet>

      <Sheet
        open={!!rotateSigner}
        onClose={() => setRotateSigner(null)}
        title={rotateSigner ? `Rotate key — ${rotateSigner.name}` : ''}
        subtitle="Old key remains valid until new key is activated + 48h time-lock"
      >
        {rotateSigner && (
          <RotateKeyForm
            signer={rotateSigner}
            onSubmit={(d) => {
              proposeRotate(rotateSigner, d);
              setRotateSigner(null);
            }}
            onCancel={() => setRotateSigner(null)}
          />
        )}
      </Sheet>

      <Sheet
        open={!!removeSigner}
        onClose={() => setRemoveSigner(null)}
        title={removeSigner ? `Remove ${removeSigner.name}` : ''}
        subtitle="Reduces active signer set — 2/3 remaining must approve"
      >
        {removeSigner && (
          <RemoveSignerForm
            signer={removeSigner}
            onSubmit={(reason) => {
              proposeRemove(removeSigner, reason);
              setRemoveSigner(null);
            }}
            onCancel={() => setRemoveSigner(null)}
          />
        )}
      </Sheet>
    </PageFrame>
  );
}
