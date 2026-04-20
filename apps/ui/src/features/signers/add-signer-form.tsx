// Propose new Treasurer form — sheet body.
import { I } from '@/icons';
import { useState } from 'react';

interface Props {
  onSubmit: (payload: { name: string; email: string; evmAddr: string; solAddr: string }) => void;
  onCancel: () => void;
}

export function AddSignerForm({ onSubmit, onCancel }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [evmAddr, setEvmAddr] = useState('');
  const [solAddr, setSolAddr] = useState('');
  const valid = name && email && evmAddr.length > 20;
  return (
    <>
      <div className="field">
        <label className="field-label" htmlFor="add-name">
          Full name
        </label>
        <input
          id="add-name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Elif Demir"
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="add-email">
          Email
        </label>
        <input
          id="add-email"
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="elif@treasury.io"
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="add-evm">
          EVM signer address <span className="text-faint text-xs">Ledger-attested only</span>
        </label>
        <input
          id="add-evm"
          className="input mono"
          value={evmAddr}
          onChange={(e) => setEvmAddr(e.target.value)}
          placeholder="0x…"
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="add-sol">
          Solana signer address <span className="text-faint text-xs">optional</span>
        </label>
        <input
          id="add-sol"
          className="input mono"
          value={solAddr}
          onChange={(e) => setSolAddr(e.target.value)}
          placeholder="Base58 pubkey"
        />
      </div>
      <div className="alert info" style={{ marginTop: 8 }}>
        <I.Info size={13} className="alert-icon" />
        <div className="alert-body">
          <div className="alert-title">48-hour time-lock</div>
          <div className="alert-text">
            After 2/3 approvals, the new signer is added to the Safe / Squads on-chain. Activation
            is delayed 48h to allow cancellation.
          </div>
        </div>
      </div>
      <div className="hstack" style={{ marginTop: 20, gap: 8 }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <div className="spacer" />
        <button
          type="button"
          className="btn btn-accent"
          disabled={!valid}
          onClick={() => onSubmit({ name, email, evmAddr, solAddr })}
        >
          Propose change
        </button>
      </div>
    </>
  );
}
