// drift-drilldown — detail view for a single snapshot: summary card + drift rows table
import type { ReconciliationDrift, ReconciliationSnapshot } from '@/api/reconciliation';
import { ChainPill, TokenPill } from '@/components/custody';
import { I } from '@/icons';
import { fmtUSD } from '@/lib/format';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  snapshot: ReconciliationSnapshot;
  drifts: ReconciliationDrift[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Decimal places per (chain, token) — BNB ERC-20 = 18, Solana SPL = 6 */
function decimalsFor(chain: string): number {
  return chain === 'bnb' ? 18 : 6;
}

function minorToUsd(minor: string, chain: string): number {
  return Number(minor) / 10 ** decimalsFor(chain);
}

function SeverityBadge({ severity, suppressed }: { severity: string; suppressed: boolean }) {
  const { t } = useTranslation();
  if (suppressed) {
    return (
      <span className="badge-tight" title={t('recon.suppressedTitle')}>
        <span className="dot" style={{ background: 'var(--text-faint)' }} />
        {t('recon.suppressed')}
      </span>
    );
  }
  const map: Record<string, string> = {
    critical: 'badge-tight err',
    warning: 'badge-tight warn',
    info: 'badge-tight ok',
  };
  const labelMap: Record<string, string> = {
    critical: t('recon.severityCritical'),
    warning: t('recon.severityWarning'),
    info: t('recon.severityInfo'),
  };
  return (
    <span className={map[severity] ?? 'badge-tight'}>
      <span className="dot" />
      {labelMap[severity] ?? severity}
    </span>
  );
}

type SeverityFilter = 'all' | 'critical' | 'warning' | 'info';

// ── Component ─────────────────────────────────────────────────────────────────

export function DriftDrilldown({ snapshot, drifts }: Props) {
  const { t } = useTranslation();
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');

  const critCount = drifts.filter((d) => d.severity === 'critical' && !d.suppressedReason).length;
  const warnCount = drifts.filter((d) => d.severity === 'warning' && !d.suppressedReason).length;
  const suppCount = drifts.filter((d) => d.suppressedReason).length;

  const filtered =
    severityFilter === 'all' ? drifts : drifts.filter((d) => d.severity === severityFilter);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Summary card */}
      <div className="card pro-card">
        <div className="pro-card-header">
          <h3 className="card-title">
            <I.Database size={12} style={{ marginRight: 6 }} />
            {t('recon.snapshotTitle', { id: snapshot.id.slice(0, 8) })}…
          </h3>
          <div className="spacer" />
          <span className="text-xs text-muted text-mono">
            {new Date(snapshot.createdAt).toLocaleString()}
          </span>
        </div>
        <div className="kpi-strip" style={{ padding: '8px 0' }}>
          <div className="kpi-mini">
            <div className="kpi-mini-label">{t('recon.criticalDrifts')}</div>
            <div
              className="kpi-mini-value"
              style={{ color: critCount > 0 ? 'var(--err-text)' : 'var(--ok-text)' }}
            >
              {critCount}
            </div>
          </div>
          <div className="kpi-mini">
            <div className="kpi-mini-label">{t('recon.warningDrifts')}</div>
            <div
              className="kpi-mini-value"
              style={{ color: warnCount > 0 ? 'var(--warn-text)' : 'var(--ok-text)' }}
            >
              {warnCount}
            </div>
          </div>
          <div className="kpi-mini">
            <div className="kpi-mini-label">{t('recon.suppressed')}</div>
            <div className="kpi-mini-value text-muted">{suppCount}</div>
          </div>
          <div className="kpi-mini">
            <div className="kpi-mini-label">Scope</div>
            <div className="kpi-mini-value">{snapshot.scope}</div>
          </div>
        </div>
        {snapshot.errorMessage && (
          <p className="text-xs" style={{ color: 'var(--err-text)', padding: '0 0 8px 0' }}>
            Error: {snapshot.errorMessage}
          </p>
        )}
      </div>

      {/* Drift rows table */}
      <div className="card pro-card">
        <div className="pro-card-header">
          <h3 className="card-title">Drift rows</h3>
          <div className="spacer" />
          {/* Severity filter pills */}
          <div style={{ display: 'flex', gap: 6 }}>
            {(
              [
                ['all', t('recon.severityAll')],
                ['critical', t('recon.severityCritical')],
                ['warning', t('recon.severityWarning')],
                ['info', t('recon.severityInfo')],
              ] as [SeverityFilter, string][]
            ).map(([f, label]) => (
              <button
                key={f}
                className={`btn btn-xs ${severityFilter === f ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSeverityFilter(f)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="text-muted text-sm" style={{ padding: 16 }}>
            No drift rows matching filter.
          </p>
        ) : (
          <table className="table table-tight">
            <thead>
              <tr>
                <th>Account</th>
                <th>Chain</th>
                <th>Token</th>
                <th className="num">On-chain</th>
                <th className="num">Ledger</th>
                <th className="num">Drift</th>
                <th>Severity</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => {
                const onChain = minorToUsd(d.onChainMinor, d.chain);
                const ledger = minorToUsd(d.ledgerMinor, d.chain);
                const drift = minorToUsd(d.driftMinor, d.chain);
                return (
                  <tr key={d.id}>
                    <td className="text-xs text-mono fw-500" title={d.address}>
                      {d.accountLabel}
                    </td>
                    <td>
                      <ChainPill chain={d.chain as 'bnb' | 'sol'} />
                    </td>
                    <td>
                      <TokenPill token={d.token as 'USDT' | 'USDC'} />
                    </td>
                    <td className="num text-mono">${fmtUSD(onChain)}</td>
                    <td className="num text-mono">${fmtUSD(ledger)}</td>
                    <td
                      className="num text-mono"
                      style={{
                        color:
                          drift === 0
                            ? 'var(--text-faint)'
                            : drift > 0
                              ? 'var(--err-text)'
                              : 'var(--warn-text)',
                      }}
                    >
                      {drift === 0 ? '—' : (drift > 0 ? '+' : '') + fmtUSD(drift)}
                    </td>
                    <td>
                      <SeverityBadge severity={d.severity} suppressed={!!d.suppressedReason} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
