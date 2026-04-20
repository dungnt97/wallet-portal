// Users page modals — invite staff + add end user.
import { Modal, useToast } from '@/components/overlays';
import { I } from '@/icons';
import { ROLES, type RoleId } from '@/lib/constants';
import { useState } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function InviteStaffModal({ open, onClose }: Props) {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<RoleId>('operator');
  const submit = () => {
    toast(`Invite sent to ${email}.`, 'success');
    setEmail('');
    setName('');
    setRole('operator');
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Invite staff member"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <div className="spacer" />
          <button
            type="button"
            className="btn btn-accent"
            onClick={submit}
            disabled={!email || !name}
          >
            Send invite
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
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [kyc, setKyc] = useState('T1');
  const submit = () => {
    toast(`User ${name} created. Wallet addresses provisioned.`, 'success');
    setEmail('');
    setName('');
    setKyc('T1');
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add end user"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <div className="spacer" />
          <button
            type="button"
            className="btn btn-accent"
            onClick={submit}
            disabled={!email || !name}
          >
            Create user
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <label className="field" htmlFor="user-name">
          <span className="field-label">Full name</span>
          <input
            id="user-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="field" htmlFor="user-email">
          <span className="field-label">Email</span>
          <input
            id="user-email"
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="field" htmlFor="user-kyc">
          <span className="field-label">KYC tier</span>
          <select
            id="user-kyc"
            className="input"
            value={kyc}
            onChange={(e) => setKyc(e.target.value)}
          >
            <option value="T1">T1 — basic (up to $1,000/day)</option>
            <option value="T2">T2 — standard (up to $10,000/day)</option>
            <option value="T3">T3 — enhanced (no limit)</option>
          </select>
        </label>
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
