import { api } from '@/api/client';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
// login-history — paginated table of own login attempts, fetched from /staff/me/sessions
// Replaces fixture data on the security page. Shows IP, device, date, and success/failure badge.
import { useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SessionRow {
  id: string;
  success: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  failureReason: string | null;
  createdAt: string;
}

interface SessionsResponse {
  data: SessionRow[];
  total: number;
  page: number;
}

// ── Query hook ────────────────────────────────────────────────────────────────

function useLoginHistory(page: number, limit = 20) {
  return useQuery<SessionsResponse>({
    queryKey: ['staff', 'me', 'sessions', page, limit],
    queryFn: () => api.get<SessionsResponse>(`/staff/me/sessions?page=${page}&limit=${limit}`),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse browser name from UA string — best-effort, no heavy lib. */
function parseBrowser(ua: string | null): string {
  if (!ua) return 'Unknown browser';
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('Chrome/')) return 'Chrome';
  if (ua.includes('Firefox/')) return 'Firefox';
  if (ua.includes('Safari/') && !ua.includes('Chrome/')) return 'Safari';
  return 'Browser';
}

/** Parse OS hint from UA string. */
function parseOs(ua: string | null): string {
  if (!ua) return '';
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac OS X')) return 'macOS';
  if (ua.includes('Linux')) return 'Linux';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  return '';
}

function formatDevice(ua: string | null): string {
  const browser = parseBrowser(ua);
  const os = parseOs(ua);
  return os ? `${browser} on ${os}` : browser;
}

function ResultBadge({ success, reason }: { success: boolean; reason: string | null }) {
  if (success) {
    return (
      <span className="badge-tight ok">
        <span className="dot" />
        Success
      </span>
    );
  }
  const label = reason ?? 'Failed';
  return (
    <span className="badge-tight err" title={label}>
      <span className="dot" />
      {label}
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface LoginHistoryProps {
  /** Items per page (default 20) */
  limit?: number;
}

export function LoginHistory({ limit = 20 }: LoginHistoryProps) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useLoginHistory(page, limit);

  const totalPages = data ? Math.ceil(data.total / limit) : 1;

  if (isLoading && !data) {
    return (
      <div className="card pro-card" style={{ padding: 24 }}>
        <p className="text-muted text-sm">Loading login history…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="card pro-card" style={{ padding: 24 }}>
        <p className="text-sm" style={{ color: 'var(--err-text)' }}>
          Failed to load login history.
        </p>
      </div>
    );
  }

  const rows = data?.data ?? [];

  return (
    <div className="card pro-card">
      <div className="pro-card-header">
        <h3 className="card-title">Login history</h3>
        <div className="spacer" />
        <span className="text-xs text-muted">{data?.total ?? 0} attempts</span>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: '24px 0', textAlign: 'center' }}>
          <p className="text-muted text-sm">No login history yet.</p>
        </div>
      ) : (
        <table className="table table-tight">
          <thead>
            <tr>
              <th>Date</th>
              <th>IP address</th>
              <th>Device</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="text-mono text-xs">
                  {new Date(row.createdAt).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </td>
                <td className="text-mono text-xs">{row.ipAddress ?? '—'}</td>
                <td className="text-xs text-muted">{formatDevice(row.userAgent)}</td>
                <td>
                  <ResultBadge success={row.success} reason={row.failureReason} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {totalPages > 1 && (
        <div className="pro-card-footer" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            aria-label="Previous page"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="text-xs text-muted">
            Page {page} / {totalPages}
          </span>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            aria-label="Next page"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
