import { api } from '@/api/client';
import type { KycTier } from '@/api/users';
import { useCreateUser } from '@/api/users';
// Users page modals — invite staff (wired to POST /staff/invite) + add end user (real API).
import { Modal, useToast } from '@/components/overlays';
import { I } from '@/icons';
import { ROLES, type RoleId } from '@/lib/constants';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
}

interface InviteResult {
  staffId: string;
  inviteLink: string;
  expiresAt: string;
}

function useInviteStaffMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; name: string; role: RoleId }) =>
      api.post<InviteResult>('/staff/invite', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['staff'] });
    },
  });
}

export function InviteStaffModal({ open, onClose }: Props) {
  const toast = useToast();
  const inviteMutation = useInviteStaffMutation();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<RoleId>('operator');
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const reset = () => {
    setEmail('');
    setName('');
    setRole('operator');
    setInviteLink(null);
    inviteMutation.reset();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const submit = () => {
    inviteMutation.mutate(
      { email, name, role },
      {
        onSuccess: (result) => {
          setInviteLink(result.inviteLink);
          toast(`Invite sent to ${email}.`, 'success');
        },
        onError: (err) => {
          toast((err as Error).message ?? 'Failed to send invite', 'error');
        },
      }
    );
  };

  if (inviteLink) {
    return (
      <Modal
        open={open}
        onClose={handleClose}
        title="Invite sent"
        footer={
          <button type="button" className="btn btn-accent" onClick={handleClose}>
            Done
          </button>
        }
      >
        <div style={{ display: 'grid', gap: 12 }}>
          <p className="text-sm text-muted">
            Share this invite link with <strong>{email}</strong>. Expires in 72 hours.
          </p>
          <div
            className="text-mono text-xs"
            style={{
              padding: 10,
              background: 'var(--surface-2)',
              borderRadius: 8,
              wordBreak: 'break-all',
            }}
          >
            {inviteLink}
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Invite staff member"
      footer={
        <>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleClose}
            disabled={inviteMutation.isPending}
          >
            Cancel
          </button>
          <div className="spacer" />
          <button
            type="button"
            className="btn btn-accent"
            onClick={submit}
            disabled={!email || !name || inviteMutation.isPending}
          >
            {inviteMutation.isPending ? '…' : 'Send invite'}
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <label className="field" htmlFor="invite-name">
          <span className="field-label">Full name</span>
          <input
            id="invite-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jordan Lee"
          />
        </label>
        <label className="field" htmlFor="invite-email">
          <span className="field-label">Work email</span>
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
          <span className="field-label">Role</span>
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
        {inviteMutation.isError && (
          <div className="text-xs" style={{ color: 'var(--error-text)' }}>
            {(inviteMutation.error as Error).message}
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
          <I.Shield size={11} /> A sign-up link with MFA setup will be emailed. The invite expires
          in 72 hours.
        </div>
      </div>
    </Modal>
  );
}

export function AddUserModal({ open, onClose }: Props) {
  const toast = useToast();
  const createUser = useCreateUser();
  const [email, setEmail] = useState('');
  const [kycTier, setKycTier] = useState<KycTier>('basic');
  // Addresses shown after successful creation
  const [createdAddresses, setCreatedAddresses] = useState<Array<{
    chain: string;
    address: string;
  }> | null>(null);

  const handleClose = () => {
    setEmail('');
    setKycTier('basic');
    setCreatedAddresses(null);
    onClose();
  };

  const submit = () => {
    createUser.mutate(
      { email, kycTier },
      {
        onSuccess: (result) => {
          setCreatedAddresses(result.addresses);
          toast('User created. Wallet addresses provisioned.', 'success');
        },
        onError: (err) => {
          toast((err as Error).message ?? 'Failed to create user', 'error');
        },
      }
    );
  };

  // After creation, show the derived addresses before closing
  if (createdAddresses) {
    return (
      <Modal
        open={open}
        onClose={handleClose}
        title="User created"
        footer={
          <button type="button" className="btn btn-accent" onClick={handleClose}>
            Done
          </button>
        }
      >
        <div style={{ display: 'grid', gap: 12 }}>
          <p className="text-sm text-muted">
            Wallet addresses have been provisioned from the HD treasury wallet.
          </p>
          {createdAddresses.map((a) => (
            <div
              key={a.chain}
              style={{
                padding: 10,
                background: 'var(--surface-2)',
                borderRadius: 8,
              }}
            >
              <div className="text-xs text-muted" style={{ marginBottom: 4 }}>
                {a.chain.toUpperCase()} address
              </div>
              <div className="text-mono text-xs" style={{ wordBreak: 'break-all' }}>
                {a.address}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Add end user"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={handleClose}>
            Cancel
          </button>
          <div className="spacer" />
          <button
            type="button"
            className="btn btn-accent"
            onClick={submit}
            disabled={!email || createUser.isPending}
          >
            {createUser.isPending ? 'Creating…' : 'Create user'}
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <label className="field" htmlFor="user-email">
          <span className="field-label">Email</span>
          <input
            id="user-email"
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
          />
        </label>
        <label className="field" htmlFor="user-kyc">
          <span className="field-label">Initial KYC tier</span>
          <select
            id="user-kyc"
            className="input"
            value={kycTier}
            onChange={(e) => setKycTier(e.target.value as KycTier)}
          >
            <option value="none">None</option>
            <option value="basic">T1 Basic</option>
            <option value="enhanced">T3 Enhanced</option>
          </select>
        </label>
        {createUser.isError && (
          <div
            className="text-xs"
            style={{
              padding: 10,
              background: 'var(--error-soft)',
              borderRadius: 8,
              color: 'var(--error-text)',
            }}
          >
            {(createUser.error as Error).message}
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
          <I.Lightning size={11} /> A BNB and Solana deposit address will be derived from the
          treasury HD wallet.
        </div>
      </div>
    </Modal>
  );
}
