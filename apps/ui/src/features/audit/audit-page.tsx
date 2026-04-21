// Audit log page — real data wiring replacing fixture stubs.
// Actions tab: paginated + filtered real rows, hash verify badge, CSV export, socket live.
// Sign-ins tab: fixture (out-of-scope per plan, real capture is auth slice work).
import { Filter, PageFrame, Tabs } from '@/components/custody';
import { useToast } from '@/components/overlays';
import { I } from '@/icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FIXTURE_LOGIN_HISTORY } from '../_shared/fixtures';
import { LiveDot } from '../_shared/realtime';
import { AuditDetailSheet } from './audit-detail-sheet';
import { AuditKpiStrip } from './audit-kpi-strip';
import { useAuditSocketListener } from './audit-socket-listener';
import { AuditActionsTable, AuditLoginsTable } from './audit-tables';
import { type AuditLogEntry, useAuditLogs, useAuditVerify } from './use-audit-logs';

const PAGE_SIZE = 50;
const EXPORT_ROW_CAP = 50_000;

type Tab = 'actions' | 'logins';

// Resource types for entity filter (mirrors DB resourceType values)
const ENTITY_OPTIONS = [
  'deposit',
  'withdrawal',
  'sweep',
  'multisig',
  'staff_member',
  'user',
  'kill_switch',
  'rebalance',
];

export function AuditPage() {
  const { t } = useTranslation();
  const toast = useToast();

  // Tab state
  const [tab, setTab] = useState<Tab>('actions');

  // Filter state
  const [entity, setEntity] = useState<string | undefined>();
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState<string | undefined>();
  const [to, setTo] = useState<string | undefined>();

  // Reset page on filter change
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset
  useEffect(() => {
    setPage(1);
  }, [entity, action, from, to]);

  // Detail sheet state
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);

  // Wire socket listener for live updates
  useAuditSocketListener();

  // Fetch audit logs
  const queryParams = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      ...(entity !== undefined && { entity }),
      ...(action !== '' && { action }),
      ...(from !== undefined && { from }),
      ...(to !== undefined && { to }),
    }),
    [page, entity, action, from, to]
  );

  const { data, isLoading } = useAuditLogs(queryParams);
  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Verify chain for current page range (run when we have rows with timestamps)
  const pageFrom = rows.length > 0 ? rows[rows.length - 1]?.createdAt : undefined;
  const pageTo = rows.length > 0 ? rows[0]?.createdAt : undefined;
  const { data: verifyData } = useAuditVerify(pageFrom, pageTo);

  // Build id -> hashValid map from verify result
  const hashValidity = useMemo<Map<string, boolean>>(() => {
    const map = new Map<string, boolean>();
    if (!verifyData) return map;
    if (verifyData.verified) {
      for (const row of rows) map.set(row.id, true);
    } else {
      // Mark broken at brokenAt id and all rows after it (rows are DESC; walk ASC for chain order)
      let broken = false;
      const asc = [...rows].reverse();
      for (const row of asc) {
        if (row.id === verifyData.brokenAt) broken = true;
        map.set(row.id, !broken);
      }
    }
    return map;
  }, [verifyData, rows]);

  // CSV export — triggers browser download of server-streamed CSV
  const handleExport = useCallback(async () => {
    if (total > EXPORT_ROW_CAP) {
      toast(t('audit.export.tooManyRows', { max: EXPORT_ROW_CAP, found: total }), 'error');
      return;
    }

    const params = new URLSearchParams();
    if (entity) params.set('entity', entity);
    if (action) params.set('action', action);
    if (from) params.set('from', from);
    if (to) params.set('to', to);

    const url = `/api/audit-logs/export.csv?${params.toString()}`;
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (res.status === 429) {
        const body = (await res.json()) as { found?: number };
        toast(
          t('audit.export.tooManyRows', { max: EXPORT_ROW_CAP, found: body.found ?? total }),
          'error'
        );
        return;
      }
      if (!res.ok) throw new Error(res.statusText);

      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const cd = res.headers.get('Content-Disposition') ?? '';
      const fileMatch = /filename="([^"]+)"/.exec(cd);
      a.download = fileMatch?.[1] ?? 'audit-export.csv';
      a.href = objUrl;
      a.click();
      URL.revokeObjectURL(objUrl);
      toast(t('audit.export.success', { n: total }), 'success');
    } catch (_err) {
      toast(t('common.error'), 'error');
    }
  }, [entity, action, from, to, total, toast, t]);

  return (
    <PageFrame
      eyebrow={
        <>
          Compliance · <span className="env-inline">{t('audit.subtitle')}</span>
        </>
      }
      title={t('audit.title')}
      policyStrip={
        <div className="policy-strip">
          <div className="policy-strip-item">
            <I.Shield size={11} />
            <span className="text-muted">{t('audit.filters.integrity')}</span>
            <span className="fw-600">SHA-256 chained</span>
            <LiveDot />
          </div>
          <div className="policy-strip-sep" />
          <div className="policy-strip-item">
            <I.Database size={11} />
            <span className="text-muted">{t('audit.filters.retention')}</span>
            <span className="fw-600">7 years</span>
          </div>
          <div className="policy-strip-sep" />
          <div className="policy-strip-item">
            <I.External size={11} />
            <span className="text-muted">{t('audit.filters.export')}</span>
            <span className="fw-600">SIEM + S3 Glacier</span>
          </div>
          <div className="spacer" />
          <span className="policy-strip-item text-mono text-xs text-muted">
            <I.Lock size={11} /> tamper-evident · append-only
          </span>
        </div>
      }
      actions={
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void handleExport()}
          disabled={tab === 'logins' || total > EXPORT_ROW_CAP}
          title={total > EXPORT_ROW_CAP ? t('audit.export.disabled') : undefined}
        >
          <I.External size={13} /> {t('audit.export.btn')}
        </button>
      }
      kpis={<AuditKpiStrip total={total} isLoading={isLoading} />}
    >
      <div className="card pro-card" style={{ marginTop: 14 }}>
        <div className="pro-card-header">
          <Tabs
            value={tab}
            onChange={(v) => setTab(v as Tab)}
            embedded
            tabs={[
              { value: 'actions', label: t('audit.filters.tabActions'), count: total },
              {
                value: 'logins',
                label: t('audit.filters.tabLogins'),
                count: FIXTURE_LOGIN_HISTORY.length,
              },
            ]}
          />
          <div className="spacer" />
          {tab === 'actions' && (
            <>
              <div className="inline-search">
                <I.Search size={13} />
                <input
                  placeholder={t('audit.filters.actionPlaceholder')}
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                />
              </div>

              <Filter
                label={t('audit.filters.entity')}
                value={entity}
                active={!!entity}
                onClick={() => {
                  const idx = entity ? ENTITY_OPTIONS.indexOf(entity) : -1;
                  const next = ENTITY_OPTIONS[(idx + 1) % ENTITY_OPTIONS.length];
                  setEntity(next);
                }}
                onClear={() => setEntity(undefined)}
              />

              <Filter
                label={t('audit.filters.from')}
                value={from ? from.slice(0, 10) : undefined}
                active={!!from}
                onClick={() => {
                  const d = window.prompt(t('audit.filters.fromPrompt'), from ?? '');
                  if (d) setFrom(new Date(d).toISOString());
                }}
                onClear={() => setFrom(undefined)}
              />

              <Filter
                label={t('audit.filters.to')}
                value={to ? to.slice(0, 10) : undefined}
                active={!!to}
                onClick={() => {
                  const d = window.prompt(t('audit.filters.toPrompt'), to ?? '');
                  if (d) setTo(new Date(d).toISOString());
                }}
                onClear={() => setTo(undefined)}
              />

              <span className="text-xs text-muted text-mono">{total}</span>
            </>
          )}
        </div>

        {tab === 'logins' ? (
          <AuditLoginsTable rows={FIXTURE_LOGIN_HISTORY} />
        ) : (
          <AuditActionsTable
            rows={rows}
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={PAGE_SIZE}
            hashValidity={hashValidity}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
            onRowClick={setSelected}
          />
        )}
      </div>

      <AuditDetailSheet
        row={selected}
        onClose={() => setSelected(null)}
        hashValid={selected ? hashValidity.get(selected.id) : undefined}
      />
    </PageFrame>
  );
}
