// HealthStatusGrid — renders per-component status chips from GET /ops/health.
// Refetches every 10s via TanStack Query refetchInterval.
import { useOpsHealth } from '@/api/queries';
import type { ProbeStatus } from '@/api/queries';
import { useTranslation } from 'react-i18next';

// ── Status chip ───────────────────────────────────────────────────────────────

interface ChipProps {
  label: string;
  status: ProbeStatus;
  sub?: string;
  error?: string;
}

function StatusChip({ label, status, sub, error }: ChipProps) {
  const ok = status === 'ok';
  return (
    <div
      className="card"
      style={{
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        borderLeft: `3px solid ${ok ? 'var(--c-green)' : 'var(--c-red)'}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: ok ? 'var(--c-green)' : 'var(--c-red)',
            flexShrink: 0,
          }}
        />
        <span style={{ fontWeight: 600, fontSize: 13 }}>{label}</span>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 11,
            fontWeight: 700,
            color: ok ? 'var(--c-green)' : 'var(--c-red)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {ok ? 'OK' : 'ERROR'}
        </span>
      </div>
      {sub && (
        <div className="text-muted" style={{ fontSize: 12, paddingLeft: 16 }}>
          {sub}
        </div>
      )}
      {!ok && error && (
        <div style={{ fontSize: 11, color: 'var(--c-red)', paddingLeft: 16 }}>{error}</div>
      )}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <div
      className="text-muted"
      style={{
        fontSize: 11,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        marginBottom: 8,
      }}
    >
      {label}
    </div>
  );
}

// ── Main grid ─────────────────────────────────────────────────────────────────

export function HealthStatusGrid() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useOpsHealth();

  if (isLoading) {
    return (
      <div className="card" style={{ padding: 24, textAlign: 'center' }}>
        <div className="spinner" style={{ margin: '0 auto' }} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="card" style={{ padding: 24, color: 'var(--c-red)', fontSize: 13 }}>
        {t('ops.health.fetchError')}
      </div>
    );
  }

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: 10,
    marginBottom: 20,
  };

  return (
    <div>
      {/* Infrastructure */}
      <SectionLabel label={t('ops.health.sectionInfra')} />
      <div style={gridStyle}>
        <StatusChip label={t('ops.health.db')} status={data.db.status} error={data.db.error} />
        <StatusChip
          label={t('ops.health.redis')}
          status={data.redis.status}
          error={data.redis.error}
        />
        <StatusChip
          label={t('ops.health.policyEngine')}
          status={data.policyEngine.status}
          error={data.policyEngine.error}
        />
      </div>

      {/* Chains */}
      <SectionLabel label={t('ops.health.sectionChains')} />
      <div style={gridStyle}>
        {data.chains.map((c) => (
          <StatusChip
            key={c.id}
            label={c.id.toUpperCase()}
            status={c.status}
            sub={
              c.latestBlock !== null
                ? t('ops.health.chainSub', {
                    block: c.latestBlock.toLocaleString(),
                    lag: c.lagBlocks ?? '—',
                  })
                : undefined
            }
            error={c.error}
          />
        ))}
      </div>

      {/* Queues */}
      <SectionLabel label={t('ops.health.sectionQueues')} />
      <div style={gridStyle}>
        {data.queues.map((q) => (
          <StatusChip
            key={q.name}
            label={q.name}
            status={q.status}
            sub={t('ops.health.queueDepth', { depth: q.depth })}
            error={q.error}
          />
        ))}
      </div>

      {/* Workers */}
      <SectionLabel label={t('ops.health.sectionWorkers')} />
      <div style={gridStyle}>
        {data.workers.map((w) => (
          <StatusChip
            key={w.name}
            label={w.name}
            status={w.status}
            sub={
              w.lastHeartbeatAgoSec !== null
                ? t('ops.health.workerHeartbeat', { sec: w.lastHeartbeatAgoSec })
                : t('ops.health.workerNoHeartbeat')
            }
            error={w.error}
          />
        ))}
      </div>
    </div>
  );
}
