// Signers KPI strip + set-health card — wired to real /signers/stats data.
import { useSignersStats } from '@/api/queries';
import { KpiStrip } from '@/components/custody';
import { I } from '@/icons';
import { MULTISIG_POLICY } from '@/lib/constants';
import { useTranslation } from 'react-i18next';

interface KpiProps {
  activeCount: number;
  pendingChanges: number;
}

/** Format ISO string into relative time label, e.g. "2d ago" */
function fmtRelative(isoStr: string | null): string {
  if (!isoStr) return '—';
  const ms = Date.now() - new Date(isoStr).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function SignersKpiStrip({ activeCount, pendingChanges }: KpiProps) {
  const { data: statsRes } = useSignersStats();
  const stats = statsRes?.data ?? [];

  // Most recently active signer
  const sorted = [...stats].sort((a, b) => {
    const ta = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0;
    const tb = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0;
    return tb - ta;
  });
  const mostRecentSigner = sorted[0] ?? null;
  const lastRotationLabel = mostRecentSigner
    ? `${fmtRelative(mostRecentSigner.lastActiveAt)}`
    : '—';
  const lastRotationSub = mostRecentSigner ? `${mostRecentSigner.name.split(' ')[0]} · EVM` : '—';

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
          value: activeCount,
          foot: (
            <>
              <span className="text-xs text-muted">of {MULTISIG_POLICY.total} slots</span>
              <span
                className={`badge-tight ${activeCount >= MULTISIG_POLICY.total ? 'ok' : 'warn'}`}
              >
                <span className="dot" />
                {activeCount >= MULTISIG_POLICY.total ? 'Full' : 'Partial'}
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
              Last key activity
            </>
          ),
          value: lastRotationLabel,
          valueStyle: { fontSize: 16 },
          foot: (
            <>
              <span className="text-xs text-muted">{lastRotationSub}</span>
              {mostRecentSigner && (
                <span className="badge-tight ok">
                  <span className="dot" />
                  Active
                </span>
              )}
            </>
          ),
        },
      ]}
    />
  );
}

interface HealthProps {
  activeCount: number;
}

export function SignerSetHealth({ activeCount }: HealthProps) {
  const { t } = useTranslation();
  const { data: statsRes } = useSignersStats();
  const stats = statsRes?.data ?? [];

  const allActive = activeCount >= MULTISIG_POLICY.total;
  const thresholdMet = activeCount >= MULTISIG_POLICY.required;
  // Key age: warn if any active signer has a key older than 90d
  const keyAgeOk = stats.every((s) => s.oldestKeyAgeDays === null || s.oldestKeyAgeDays <= 90);
  const oldestKey = stats.reduce(
    (max, s) =>
      s.oldestKeyAgeDays !== null && s.oldestKeyAgeDays > (max ?? 0) ? s.oldestKeyAgeDays : max,
    null as number | null
  );

  return (
    <div className="signers-health" style={{ marginTop: 14 }}>
      <div>
        <div className="signers-health-title">
          <I.ShieldCheck size={13} /> Set health
        </div>
        <div className="signers-health-items">
          <div className="health-item">
            <span className={`health-dot ${allActive ? 'ok' : 'warn'}`} />
            <span>
              {activeCount}/{MULTISIG_POLICY.total} signers active & verified
            </span>
          </div>
          <div className="health-item">
            <span className={`health-dot ${thresholdMet ? 'ok' : 'err'}`} />
            <span>
              Threshold {MULTISIG_POLICY.required}/{MULTISIG_POLICY.total}{' '}
              {thresholdMet ? 'meets' : 'does not meet'} policy floor
            </span>
          </div>
          <div className="health-item">
            <span className={`health-dot ${keyAgeOk ? 'ok' : 'warn'}`} />
            <span>
              {keyAgeOk
                ? 'All keys rotated within 90d target'
                : `Oldest key: ${oldestKey}d since registration (target 90d)`}
            </span>
          </div>
        </div>
      </div>
      <div>
        <div className="signers-health-title">
          <I.Lightning size={13} /> Recent sign activity
        </div>
        <div className="signers-health-items">
          {stats.length === 0 && (
            <div className="health-item text-muted text-xs">{t('common.loading')}</div>
          )}
          {stats.map((s) => (
            <div key={s.staffId} className="health-item">
              <span className="health-dot info" />
              <span>
                {s.name.split(' ')[0]} · {s.sigCount30d} sigs last 30d
                {s.lastActiveAt ? ` · ${fmtRelative(s.lastActiveAt)}` : ''}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
