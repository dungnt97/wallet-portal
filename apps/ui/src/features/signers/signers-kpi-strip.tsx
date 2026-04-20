// Signers KPI strip + set-health card.
import { I } from '@/icons';
import { MULTISIG_POLICY } from '@/lib/constants';
import type { SignerRow } from './signers-fixtures';

interface KpiProps {
  active: SignerRow[];
  pendingChanges: number;
}

export function SignersKpiStrip({ active, pendingChanges }: KpiProps) {
  return (
    <div className="kpi-strip">
      <div className="kpi-mini">
        <div className="kpi-mini-label">
          <I.Users size={10} />
          Active Treasurers
        </div>
        <div className="kpi-mini-value">{active.length}</div>
        <div className="kpi-mini-foot">
          <span className="text-xs text-muted">of {MULTISIG_POLICY.total} slots</span>
          <span className="badge-tight ok">
            <span className="dot" />
            Full
          </span>
        </div>
      </div>
      <div className="kpi-mini">
        <div className="kpi-mini-label">
          <I.Shield size={10} />
          Threshold
        </div>
        <div className="kpi-mini-value">
          {MULTISIG_POLICY.required}/{MULTISIG_POLICY.total}
        </div>
        <div className="kpi-mini-foot">
          <span className="text-xs text-muted">per withdrawal</span>
          <span className="badge-tight info">
            <span className="dot" />
            Standard
          </span>
        </div>
      </div>
      <div className="kpi-mini">
        <div className="kpi-mini-label">
          <I.Clock size={10} />
          Pending changes
        </div>
        <div className="kpi-mini-value">{pendingChanges}</div>
        <div className="kpi-mini-foot">
          <span className="text-xs text-muted text-mono">awaiting signatures</span>
          <span className="badge-tight warn">
            <span className="dot" />
            Review
          </span>
        </div>
      </div>
      <div className="kpi-mini">
        <div className="kpi-mini-label">
          <I.Key size={10} />
          Last key rotation
        </div>
        <div className="kpi-mini-value" style={{ fontSize: 16 }}>
          18h ago
        </div>
        <div className="kpi-mini-foot">
          <span className="text-xs text-muted">Ana · EVM</span>
          <span className="badge-tight ok">
            <span className="dot" />
            Executed
          </span>
        </div>
      </div>
    </div>
  );
}

interface HealthProps {
  active: SignerRow[];
}

export function SignerSetHealth({ active }: HealthProps) {
  const counts = [8, 14, 21];
  return (
    <div className="signers-health" style={{ marginTop: 14 }}>
      <div>
        <div className="signers-health-title">
          <I.ShieldCheck size={13} /> Set health
        </div>
        <div className="signers-health-items">
          <div className="health-item">
            <span className="health-dot ok" />
            <span>All 3 signers active & verified</span>
          </div>
          <div className="health-item">
            <span className="health-dot ok" />
            <span>Threshold 2/3 meets policy floor (2/3)</span>
          </div>
          <div className="health-item">
            <span className="health-dot ok" />
            <span>All keys rotated within 90d target</span>
          </div>
          <div className="health-item">
            <span className="health-dot warn" />
            <span>Hana's Solana key: 87d since last rotation (target 90d)</span>
          </div>
        </div>
      </div>
      <div>
        <div className="signers-health-title">
          <I.Lightning size={13} /> Recent sign activity
        </div>
        <div className="signers-health-items">
          {active.map((t, i) => (
            <div key={t.id} className="health-item">
              <span className="health-dot info" />
              <span>
                {t.name.split(' ')[0]} · {counts[i] ?? 10} sigs last 7d
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
