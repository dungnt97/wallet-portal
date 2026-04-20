// Signers KPI strip + set-health card.
import { KpiStrip } from '@/components/custody';
import { I } from '@/icons';
import { MULTISIG_POLICY } from '@/lib/constants';
import type { SignerRow } from './signers-fixtures';

interface KpiProps {
  active: SignerRow[];
  pendingChanges: number;
}

export function SignersKpiStrip({ active, pendingChanges }: KpiProps) {
  return (
    <KpiStrip
      items={[
        {
          key: 'active',
          label: (
            <>
              <I.Users size={10} />
              Active Treasurers
            </>
          ),
          value: active.length,
          foot: (
            <>
              <span className="text-xs text-muted">of {MULTISIG_POLICY.total} slots</span>
              <span className="badge-tight ok">
                <span className="dot" />
                Full
              </span>
            </>
          ),
        },
        {
          key: 'threshold',
          label: (
            <>
              <I.Shield size={10} />
              Threshold
            </>
          ),
          value: `${MULTISIG_POLICY.required}/${MULTISIG_POLICY.total}`,
          foot: (
            <>
              <span className="text-xs text-muted">per withdrawal</span>
              <span className="badge-tight info">
                <span className="dot" />
                Standard
              </span>
            </>
          ),
        },
        {
          key: 'pending',
          label: (
            <>
              <I.Clock size={10} />
              Pending changes
            </>
          ),
          value: pendingChanges,
          foot: (
            <>
              <span className="text-xs text-muted text-mono">awaiting signatures</span>
              <span className="badge-tight warn">
                <span className="dot" />
                Review
              </span>
            </>
          ),
        },
        {
          key: 'rotation',
          label: (
            <>
              <I.Key size={10} />
              Last key rotation
            </>
          ),
          value: '18h ago',
          valueStyle: { fontSize: 16 },
          foot: (
            <>
              <span className="text-xs text-muted">Ana · EVM</span>
              <span className="badge-tight ok">
                <span className="dot" />
                Executed
              </span>
            </>
          ),
        },
      ]}
    />
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
