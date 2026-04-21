// Audit log detail sheet — slide-in panel showing full row detail
// Displays payload JSON, actor info, hash chain pair, and verify badge
import { Sheet } from '@/components/overlays';
import { I } from '@/icons';
import { fmtDateTime } from '@/lib/format';
import { useTranslation } from 'react-i18next';
import type { AuditLogEntry } from './use-audit-logs';

interface Props {
  row: AuditLogEntry | null;
  onClose: () => void;
  /** Per-row hash validity from the verify endpoint (undefined = not yet checked) */
  hashValid?: boolean;
}

function HashBadge({ valid }: { valid: boolean | undefined }) {
  if (valid === undefined) {
    return <span className="badge muted">hash: checking…</span>;
  }
  return valid ? (
    <span className="badge ok">
      <I.Shield size={10} /> hash ok
    </span>
  ) : (
    <span className="badge danger">
      <I.AlertTri size={10} /> hash broken
    </span>
  );
}

export function AuditDetailSheet({ row, onClose, hashValid }: Props) {
  const { t } = useTranslation();

  return (
    <Sheet
      open={row !== null}
      onClose={onClose}
      title={t('audit.detail.title', { action: row?.action ?? '' })}
      subtitle={row ? fmtDateTime(row.createdAt) : undefined}
      wide
    >
      {row && (
        <div className="vstack gap-16">
          {/* Actor info */}
          <section>
            <div className="section-label">{t('audit.detail.actor')}</div>
            <div className="hstack gap-8" style={{ marginTop: 6 }}>
              <div className="avatar" style={{ width: 28, height: 28, fontSize: 11 }}>
                {row.actorName
                  ? row.actorName
                      .split(' ')
                      .map((p) => p[0])
                      .join('')
                      .toUpperCase()
                  : 'SYS'}
              </div>
              <div>
                <div className="fw-500 text-sm">{row.actorName ?? t('audit.detail.system')}</div>
                <div className="text-xs text-muted">{row.actorEmail ?? '—'}</div>
              </div>
            </div>
          </section>

          {/* Resource info */}
          <section>
            <div className="section-label">{t('audit.detail.resource')}</div>
            <div className="kv-grid" style={{ marginTop: 6 }}>
              <span className="text-xs text-muted">{t('audit.detail.entity')}</span>
              <span className="text-sm text-mono">{row.resourceType}</span>
              <span className="text-xs text-muted">{t('audit.detail.entityId')}</span>
              <span className="text-sm text-mono">{row.resourceId ?? '—'}</span>
              <span className="text-xs text-muted">{t('audit.detail.action')}</span>
              <span className="text-sm text-mono">{row.action}</span>
              {row.ipAddr && (
                <>
                  <span className="text-xs text-muted">IP</span>
                  <span className="text-sm text-mono">{row.ipAddr}</span>
                </>
              )}
            </div>
          </section>

          {/* Payload JSON */}
          <section>
            <div className="section-label">{t('audit.detail.payload')}</div>
            <pre
              style={{
                marginTop: 6,
                padding: '10px 12px',
                background: 'var(--surface-2)',
                borderRadius: 6,
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                overflowX: 'auto',
                maxHeight: 300,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {JSON.stringify(row.changes, null, 2)}
            </pre>
          </section>

          {/* Hash chain */}
          <section>
            <div className="section-label hstack gap-8">
              {t('audit.detail.hashChain')}
              <HashBadge valid={hashValid} />
            </div>
            <div className="kv-grid" style={{ marginTop: 6 }}>
              <span className="text-xs text-muted">{t('audit.detail.prevHash')}</span>
              <span className="text-xs text-mono text-muted" style={{ wordBreak: 'break-all' }}>
                {row.prevHash || '(genesis)'}
              </span>
              <span className="text-xs text-muted">{t('audit.detail.hash')}</span>
              <span className="text-xs text-mono" style={{ wordBreak: 'break-all' }}>
                {row.hash}
              </span>
            </div>
          </section>
        </div>
      )}
    </Sheet>
  );
}
