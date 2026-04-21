// account-settings-modal — real form: name + locale pref update + password link-out + logout-all
// PATCH /staff/me  → update name / localePref
// POST  /staff/me/logout-all → destroy current session
import { api } from '@/api/client';
import { useAuth } from '@/auth/use-auth';
import { Modal } from '@/components/overlays/modal';
import { useToast } from '@/components/overlays/toast-host';
import { I } from '@/icons';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface ProfileUpdateBody {
  name?: string;
  localePref?: 'en' | 'vi';
}

interface ProfileUpdateResult {
  id: string;
  name: string;
  email: string;
  localePref: string;
}

function useUpdateProfile() {
  return useMutation({
    mutationFn: (body: ProfileUpdateBody) => api.patch<ProfileUpdateResult>('/staff/me', body),
  });
}

function useLogoutAll() {
  return useMutation({
    mutationFn: () => api.post<{ message: string }>('/staff/me/logout-all'),
  });
}

export function AccountSettingsModal({ open, onClose }: Props) {
  const { t } = useTranslation();
  const { staff, refresh, logout } = useAuth();
  const toast = useToast();

  const [name, setName] = useState(staff?.name ?? '');
  const [localePref, setLocalePref] = useState<'en' | 'vi'>('en');

  const updateProfile = useUpdateProfile();
  const logoutAll = useLogoutAll();

  const isDirty = name !== (staff?.name ?? '') || localePref !== 'en';

  const handleSave = () => {
    const body: ProfileUpdateBody = {};
    if (name !== staff?.name) body.name = name;
    if (localePref !== 'en') body.localePref = localePref;

    updateProfile.mutate(body, {
      onSuccess: async () => {
        toast(t('account.saved'), 'success');
        await refresh();
        onClose();
      },
      onError: (err) => {
        toast((err as Error).message ?? t('common.error'), 'error');
      },
    });
  };

  const handleLogoutAll = () => {
    logoutAll.mutate(undefined, {
      onSuccess: () => {
        toast(t('account.loggedOutAll'), 'success');
        logout();
      },
      onError: (err) => {
        toast((err as Error).message ?? t('common.error'), 'error');
      },
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('account.title')}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <div className="spacer" />
          <button
            type="button"
            className="btn btn-accent"
            onClick={handleSave}
            disabled={updateProfile.isPending || !isDirty}
          >
            {updateProfile.isPending ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 20 }}>
        {/* Profile section */}
        <section>
          <div
            className="text-xs fw-600 text-muted"
            style={{ marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}
          >
            {t('account.profile')}
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            <label className="field" htmlFor="acct-name">
              <span className="field-label">{t('account.name')}</span>
              <input
                id="acct-name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
              />
            </label>
            <label className="field" htmlFor="acct-email">
              <span className="field-label">{t('account.email')}</span>
              <input
                id="acct-email"
                className="input"
                value={staff?.email ?? ''}
                readOnly
                style={{ opacity: 0.6, cursor: 'not-allowed' }}
                title="Email is managed by Google Workspace"
              />
              <span className="text-xs text-muted" style={{ marginTop: 4 }}>
                <I.Shield size={10} /> {t('account.emailManaged')}
              </span>
            </label>
            <label className="field" htmlFor="acct-locale">
              <span className="field-label">{t('account.locale')}</span>
              <select
                id="acct-locale"
                className="input"
                value={localePref}
                onChange={(e) => setLocalePref(e.target.value as 'en' | 'vi')}
              >
                <option value="en">English</option>
                <option value="vi">Tiếng Việt</option>
              </select>
            </label>
          </div>
        </section>

        {/* Password section */}
        <section>
          <div
            className="text-xs fw-600 text-muted"
            style={{ marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}
          >
            {t('account.password')}
          </div>
          <div
            style={{
              padding: 12,
              background: 'var(--info-soft)',
              borderRadius: 8,
              fontSize: 13,
              color: 'var(--info-text)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <I.External size={13} />
            <span>
              {t('account.passwordManaged')}{' '}
              <a
                href="https://myaccount.google.com/security"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--accent)', textDecoration: 'underline' }}
              >
                {t('account.changePasswordLink')}
              </a>
            </span>
          </div>
        </section>

        {/* Sessions section */}
        <section>
          <div
            className="text-xs fw-600 text-muted"
            style={{ marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}
          >
            {t('account.sessions')}
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ color: 'var(--err-text)', borderColor: 'var(--err-text)' }}
            onClick={handleLogoutAll}
            disabled={logoutAll.isPending}
          >
            <I.LogOut size={13} />
            {logoutAll.isPending ? t('common.loading') : t('account.logoutAll')}
          </button>
          <div className="text-xs text-muted" style={{ marginTop: 6 }}>
            {t('account.logoutAllHint')}
          </div>
        </section>
      </div>
    </Modal>
  );
}
