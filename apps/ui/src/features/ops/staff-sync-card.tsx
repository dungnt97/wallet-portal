// staff-sync-card — trigger Google Workspace staff directory sync.
// POST /staff/sync-google-workspace
// When GW credentials are not configured the API returns 501 and the card
// shows the setup note from the runbook instead of an error toast.
import { api } from '@/api/client';
import { useToast } from '@/components/overlays';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface SyncResult {
  synced: number;
  created: number;
  updated: number;
  offboarded: number;
  durationMs: number;
  note?: string;
}

function useSyncGoogleWorkspace() {
  return useMutation({
    mutationFn: () => api.post<SyncResult>('/staff/sync-google-workspace', {}),
  });
}

export function StaffSyncCard() {
  const { t } = useTranslation();
  const toast = useToast();
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [stubNote, setStubNote] = useState<string | null>(null);

  const mutation = useSyncGoogleWorkspace();

  const handleSync = () => {
    setStubNote(null);
    mutation.mutate(undefined, {
      onSuccess: (result) => {
        setLastSync(new Date().toISOString());
        toast(t('ops.staffSync.success'), 'success');
        if (result.note) setStubNote(result.note);
      },
      onError: (err) => {
        const msg = (err as Error).message ?? '';
        // 501 from the API → show the stub setup note, not an error toast
        if (msg.includes('credentials not configured') || msg.includes('NOT_IMPLEMENTED')) {
          setStubNote(t('ops.staffSync.stubNote'));
        } else {
          toast(t('ops.staffSync.error', { msg }), 'error');
        }
      },
    });
  };

  return (
    <div className="card pro-card" style={{ padding: '16px 20px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: stubNote ? 12 : 0,
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{t('ops.staffSync.cardTitle')}</div>
          <div className="text-xs text-muted" style={{ marginTop: 3 }}>
            {lastSync
              ? t('ops.staffSync.lastSync', {
                  ts: new Date(lastSync).toLocaleString(),
                })
              : t('ops.staffSync.neverSynced')}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleSync}
          disabled={mutation.isPending}
          style={{ flexShrink: 0 }}
        >
          {mutation.isPending ? t('ops.staffSync.syncing') : t('ops.staffSync.syncBtn')}
        </button>
      </div>

      {stubNote && (
        <div
          style={{
            padding: '8px 12px',
            background: 'var(--warn-soft)',
            borderRadius: 8,
            fontSize: 12,
            color: 'var(--warn-text)',
          }}
        >
          {stubNote}
        </div>
      )}
    </div>
  );
}
