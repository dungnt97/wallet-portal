// channel-form-modal.tsx — Add/Edit notification channel modal.
// Used for both create (no initialData) and edit (initialData provided).
import type { AdminChannel, ChannelKind, NotifSeverityFilter } from '@/api/queries';
import { useCreateAdminChannel, useUpdateAdminChannel } from '@/api/queries';
import { Modal } from '@/components/overlays';
import { useToast } from '@/components/overlays';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

// ── Validation helpers ────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/.+/;

function validateTarget(kind: ChannelKind, target: string): string | null {
  if (!target.trim()) return 'Target is required';
  if (kind === 'email' && !EMAIL_RE.test(target)) return 'Enter a valid email address';
  if ((kind === 'slack' || kind === 'webhook') && !URL_RE.test(target))
    return 'Enter a valid https:// URL';
  if (kind === 'pagerduty' && target.trim().length < 4)
    return 'Enter a valid PagerDuty integration key';
  return null;
}

// ── Target placeholder per kind ───────────────────────────────────────────────

const TARGET_PLACEHOLDER: Record<ChannelKind, string> = {
  email: 'team@company.io',
  slack: 'https://hooks.slack.com/services/...',
  pagerduty: 'pd-integration-key',
  webhook: 'https://siem.example.com/hook',
};

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  /** When provided, modal is in edit mode */
  initialData?: AdminChannel;
}

const KIND_OPTIONS: ChannelKind[] = ['email', 'slack', 'pagerduty', 'webhook'];
const SEVERITY_OPTIONS: NotifSeverityFilter[] = ['info', 'warn', 'err'];

export function ChannelFormModal({ open, onClose, initialData }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const isEdit = !!initialData;

  const [kind, setKind] = useState<ChannelKind>(initialData?.kind ?? 'email');
  const [name, setName] = useState(initialData?.name ?? '');
  const [target, setTarget] = useState(initialData?.target ?? '');
  const [severityFilter, setSeverityFilter] = useState<NotifSeverityFilter>(
    initialData?.severityFilter ?? 'info'
  );
  const [targetError, setTargetError] = useState<string | null>(null);

  const createMut = useCreateAdminChannel();
  const updateMut = useUpdateAdminChannel();
  const isPending = createMut.isPending || updateMut.isPending;

  const handleKindChange = (k: ChannelKind) => {
    setKind(k);
    setTargetError(null);
  };

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    const trimmedTarget = target.trim();

    if (!trimmedName) return;
    const err = validateTarget(kind, trimmedTarget);
    if (err) {
      setTargetError(err);
      return;
    }

    try {
      if (isEdit && initialData) {
        await updateMut.mutateAsync({
          id: initialData.id,
          name: trimmedName,
          target: trimmedTarget,
          severityFilter,
        });
        toast(t('notifs.channels.updated'), 'success');
      } else {
        await createMut.mutateAsync({
          kind,
          name: trimmedName,
          target: trimmedTarget,
          severityFilter,
        });
        toast(t('notifs.channels.created'), 'success');
      }
      onClose();
    } catch {
      toast(t('common.error'), 'error');
    }
  };

  // Reset form when modal opens fresh
  const handleClose = () => {
    if (!isEdit) {
      setKind('email');
      setName('');
      setTarget('');
      setSeverityFilter('info');
    }
    setTargetError(null);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={isEdit ? t('notifs.editChannel') : t('notifs.addChannel')}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={handleClose}>
            {t('common.cancel')}
          </button>
          <div className="spacer" />
          <button
            type="button"
            className="btn btn-accent"
            onClick={() => void handleSubmit()}
            disabled={isPending || !name.trim() || !target.trim()}
          >
            {isPending ? t('common.saving') : isEdit ? t('common.save') : t('notifs.addChannel')}
          </button>
        </>
      }
    >
      <div className="form-stack" style={{ gap: 14 }}>
        {/* Kind selector — only shown for new channels */}
        {!isEdit && (
          <div className="form-field">
            <label className="form-label" htmlFor="ch-kind-buttons">
              {t('notifs.channels.kind')}
            </label>
            <div id="ch-kind-buttons" className="segmented" style={{ marginTop: 4 }}>
              {KIND_OPTIONS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`seg-btn${kind === k ? ' active' : ''}`}
                  onClick={() => handleKindChange(k)}
                >
                  {k === 'pagerduty' ? 'PagerDuty' : k.charAt(0).toUpperCase() + k.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Name */}
        <div className="form-field">
          <label className="form-label" htmlFor="ch-name-input">
            {t('notifs.channels.name')}
          </label>
          <input
            id="ch-name-input"
            className="input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isEdit ? '' : 'e.g. Treasury Alerts'}
            maxLength={200}
          />
        </div>

        {/* Target */}
        <div className="form-field">
          <label className="form-label" htmlFor="ch-target-input">
            {t('notifs.channels.target')}
          </label>
          <input
            id="ch-target-input"
            className={`input${targetError ? ' input-error' : ''}`}
            type={kind === 'email' ? 'email' : 'text'}
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              setTargetError(null);
            }}
            placeholder={TARGET_PLACEHOLDER[kind]}
            maxLength={500}
          />
          {targetError && (
            <div className="text-xs" style={{ color: 'var(--err-text)', marginTop: 4 }}>
              {targetError}
            </div>
          )}
        </div>

        {/* Severity filter */}
        <div className="form-field">
          <label className="form-label" htmlFor="ch-severity-group">
            {t('notifs.channels.severityFilter')}
          </label>
          <div id="ch-severity-group" style={{ display: 'flex', gap: 12, marginTop: 6 }}>
            {SEVERITY_OPTIONS.map((s) => (
              <label
                key={s}
                className="radio-row"
                style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
              >
                <input
                  type="radio"
                  name="severity_filter"
                  value={s}
                  checked={severityFilter === s}
                  onChange={() => setSeverityFilter(s)}
                />
                <span className={`badge-tight ${s}`}>{s}</span>
                <span className="text-xs text-muted">
                  {s === 'info' ? '(all)' : s === 'warn' ? '(warn+err)' : '(err only)'}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
