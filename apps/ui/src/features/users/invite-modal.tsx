// invite-modal — admin creates signed invite link for new staff
// POST /staff/invite → returns { staffId, inviteLink, expiresAt }
// UI shows copyable link; admin emails manually or SMTP worker sends automatically.
import { api } from '@/api/client';
import { Modal } from '@/components/overlays/modal';
import { useToast } from '@/components/overlays/toast-host';
import { I } from '@/icons';
import { ROLES, type RoleId } from '@/lib/constants';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface InviteBody {
  email: string;
  name: string;
  role: RoleId;
}

interface InviteResult {
  staffId: string;
  inviteLink: string;
  expiresAt: string;
}

function useInviteStaff() {
  return useMutation({
    mutationFn: (body: InviteBody) => api.post<InviteResult>('/staff/invite', body),
  });
}

export function InviteModal({ open, onClose }: Props) {
  const { t } = useTranslation();
  const toast = useToast();

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<RoleId>('operator');
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);
  const [copied, setCopied] = useState(false);

  const invite = useInviteStaff();

  const handleClose = () => {
    setEmail('');
    setName('');
    setRole('operator');
    setInviteResult(null);
    setCopied(false);
    onClose();
  };

  const handleSubmit = () => {
    invite.mutate(
      { email, name, role },
      {
        onSuccess: (result) => {
          setInviteResult(result);
        },
        onError: (err) => {
          toast((err as Error).message ?? t('common.error'), 'error');
        },
      }
    );
  };

  const handleCopy = async () => {
    if (!inviteResult) return;
    try {
      await navigator.clipboard.writeText(inviteResult.inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast(t('common.copyFailed'), 'error');
    }
  };

  // ── Success state: show invite link ───────────────────────────────────────
  if (inviteResult) {
    return (
      <Modal
        open={open}
        onClose={handleClose}
        title={t('users.inviteSent')}
        footer={
          <button type="button" className="btn btn-accent" onClick={handleClose}>
            {t('common.done')}
          </button>
        }
      >
        <div style={{ display: 'grid', gap: 14 }}>
          <p className="text-sm text-muted">{t('users.inviteLinkDesc')}</p>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
              background: 'var(--surface-2)',
              borderRadius: 8,
              border: '1px solid var(--border)',
            }}
          >
            <code
              className="text-xs"
              style={{ flex: 1, wordBreak: 'break-all', fontFamily: 'var(--font-mono)' }}
            >
              {inviteResult.inviteLink}
            </code>
            <button
              type="button"
              className="icon-btn"
              onClick={handleCopy}
              title={copied ? t('common.copied') : t('common.copy')}
              style={{ flexShrink: 0 }}
            >
              {copied ? <I.Check size={14} /> : <I.Copy size={14} />}
            </button>
          </div>

          <div
            className="text-xs text-muted"
            style={{
              padding: 10,
              background: 'var(--warn-soft)',
              borderRadius: 8,
              color: 'var(--warn-text)',
            }}
          >
            <I.Clock size={11} />{' '}
            {t('users.inviteExpiry', {
              date: new Date(inviteResult.expiresAt).toLocaleDateString(),
            })}
          </div>
        </div>
      </Modal>
    );
  }

  // ── Form state ─────────────────────────────────────────────────────────────
  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('users.inviteTitle')}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={handleClose}>
            {t('common.cancel')}
          </button>
          <div className="spacer" />
          <button
            type="button"
            className="btn btn-accent"
            onClick={handleSubmit}
            disabled={!email || !name || invite.isPending}
          >
            {invite.isPending ? t('common.loading') : t('users.sendInvite')}
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <label className="field" htmlFor="invite-name">
          <span className="field-label">{t('users.inviteFullName')}</span>
          <input
            id="invite-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jordan Lee"
          />
        </label>

        <label className="field" htmlFor="invite-email">
          <span className="field-label">{t('users.inviteEmail')}</span>
          <input
            id="invite-email"
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jordan@treasury.io"
          />
        </label>

        <label className="field" htmlFor="invite-role">
          <span className="field-label">{t('users.inviteRole')}</span>
          <select
            id="invite-role"
            className="input"
            value={role}
            onChange={(e) => setRole(e.target.value as RoleId)}
          >
            {Object.values(ROLES).map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>

        {invite.isError && (
          <div
            className="text-xs"
            style={{
              padding: 10,
              background: 'var(--error-soft)',
              borderRadius: 8,
              color: 'var(--error-text)',
            }}
          >
            {(invite.error as Error).message}
          </div>
        )}

        <div
          className="text-xs text-muted"
          style={{
            padding: 10,
            background: 'var(--info-soft)',
            borderRadius: 8,
            color: 'var(--info-text)',
          }}
        >
          <I.Shield size={11} /> {t('users.inviteHint')}
        </div>
      </div>
    </Modal>
  );
}
