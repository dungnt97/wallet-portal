// Audit log page — ports prototype page_audit.jsx.
// Two tabs: Actions (filterable + paginated) and Sign-ins.
import { Filter, Tabs } from '@/components/custody';
import { useToast } from '@/components/overlays';
import { I } from '@/icons';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AUDIT_LOG, FIXTURE_LOGIN_HISTORY } from '../_shared/fixtures';
import { downloadCSV } from '../_shared/helpers';
import { LiveDot } from '../_shared/realtime';
import { AuditKpiStrip } from './audit-kpi-strip';
import { AuditActionsTable, AuditLoginsTable } from './audit-tables';

const PAGE_SIZE = 30;
type Tab = 'actions' | 'logins';

export function AuditPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('actions');
  const [actor, setActor] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const actors = useMemo<string[]>(
    () => [
      'system',
      ...Array.from(new Set(AUDIT_LOG.filter((l) => l.actor !== 'system').map((l) => l.actor))),
    ],
    []
  );

  const filtered = useMemo(
    () =>
      AUDIT_LOG.filter((l) => {
        if (actor && l.actor !== actor) return false;
        if (
          search &&
          !l.action.toLowerCase().includes(search.toLowerCase()) &&
          !l.subject.toLowerCase().includes(search.toLowerCase())
        )
          return false;
        return true;
      }),
    [actor, search]
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  // biome-ignore lint/correctness/useExhaustiveDependencies: filter signature only
  useEffect(() => {
    setPage(1);
  }, [actor, search]);

  const doExport = () => {
    if (tab === 'logins') {
      downloadCSV(
        'login-history.csv',
        FIXTURE_LOGIN_HISTORY.map((l) => [l.name, l.email, l.role, l.ip, l.ua, l.at]),
        ['name', 'email', 'role', 'ip', 'ua', 'at']
      );
      toast(`Exported ${FIXTURE_LOGIN_HISTORY.length} rows.`, 'success');
    } else {
      downloadCSV(
        'audit-log.csv',
        filtered.map((l) => [l.action, l.subject, l.actor, l.ip, l.timestamp, l.severity]),
        ['action', 'subject', 'actor', 'ip', 'timestamp', 'severity']
      );
      toast(`Exported ${filtered.length} rows.`, 'success');
    }
  };

  return (
    <div className="page page-dense">
      <div className="policy-strip">
        <div className="policy-strip-item">
          <I.Shield size={11} />
          <span className="text-muted">Log integrity:</span>
          <span className="fw-600">SHA-256 chained</span>
          <LiveDot />
        </div>
        <div className="policy-strip-sep" />
        <div className="policy-strip-item">
          <I.Database size={11} />
          <span className="text-muted">Retention:</span>
          <span className="fw-600">7 years</span>
        </div>
        <div className="policy-strip-sep" />
        <div className="policy-strip-item">
          <I.External size={11} />
          <span className="text-muted">Export:</span>
          <span className="fw-600">SIEM + S3 Glacier</span>
        </div>
        <div className="spacer" />
        <span className="policy-strip-item text-mono text-xs text-muted">
          <I.Lock size={11} /> tamper-evident · append-only
        </span>
      </div>

      <div className="page-header">
        <div>
          <div className="page-eyebrow">
            Compliance · <span className="env-inline">{t('audit.subtitle')}</span>
          </div>
          <h1 className="page-title">{t('audit.title')}</h1>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-secondary" onClick={doExport}>
            <I.External size={13} /> {t('common.export')}
          </button>
        </div>
      </div>

      <AuditKpiStrip log={AUDIT_LOG} logins={FIXTURE_LOGIN_HISTORY} />

      <div className="card pro-card" style={{ marginTop: 14 }}>
        <div className="pro-card-header">
          <Tabs
            value={tab}
            onChange={(v) => setTab(v as Tab)}
            embedded
            tabs={[
              { value: 'actions', label: 'Actions', count: AUDIT_LOG.length },
              { value: 'logins', label: 'Sign-ins', count: FIXTURE_LOGIN_HISTORY.length },
            ]}
          />
          <div className="spacer" />
          {tab === 'actions' && (
            <>
              <div className="inline-search">
                <I.Search size={13} />
                <input
                  placeholder="Search action or subject…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Filter
                label="Actor"
                value={actor ?? undefined}
                active={!!actor}
                onClick={() => {
                  const idx = actors.indexOf(actor ?? '');
                  setActor(actors[(idx + 1) % actors.length] ?? null);
                }}
                onClear={() => setActor(null)}
              />
              <Filter label="Severity" />
              <Filter label="Date" />
              <span className="text-xs text-muted text-mono">{filtered.length}</span>
            </>
          )}
        </div>

        {tab === 'logins' ? (
          <AuditLoginsTable rows={FIXTURE_LOGIN_HISTORY} />
        ) : (
          <AuditActionsTable
            rows={pageRows}
            page={page}
            totalPages={totalPages}
            total={filtered.length}
            pageSize={PAGE_SIZE}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
          />
        )}
      </div>
    </div>
  );
}
