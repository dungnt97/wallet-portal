// Rotate key form — sheet body for Treasurer key rotation.
import { Segmented } from '@/components/custody';
import { I } from '@/icons';
import { useState } from 'react';
import type { SignerRow } from './signers-fixtures';

interface Props {
  signer: SignerRow;
  onSubmit: (payload: { chain: 'evm' | 'sol'; addr: string }) => void;
  onCancel: () => void;
}

export function RotateKeyForm({ signer, onSubmit, onCancel }: Props) {
  const [chain, setChain] = useState<'evm' | 'sol'>('evm');
  const [addr, setAddr] = useState('');
  const current = chain === 'evm' ? signer.evmAddr : signer.solAddr;
  const valid = addr.length > 20;
  return (
    <>
      <div className="field">
        <span className="field-label">Which key</span>
        <Segmented<'evm' | 'sol'>
          options={[
            { value: 'evm', label: 'EVM (BNB)' },
            { value: 'sol', label: 'Solana' },
          ]}
          value={chain}
          onChange={setChain}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="rotate-current">
          Current address
        </label>
        <input id="rotate-current" className="input mono" value={current ?? 'not set'} disabled />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="rotate-new">
          New address
        </label>
        <input
          id="rotate-new"
          className="input mono"
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
          placeholder={chain === 'evm' ? '0x…' : 'Base58 pubkey'}
        />
      </div>
      <div className="alert warn" style={{ marginTop: 8 }}>
        <I.AlertTri size={13} className="alert-icon" />
        <div className="alert-body">
          <div className="alert-title">Rotation behaviour</div>
          <div className="alert-text">
            Old key remains valid as a signer until the new key activates (T + 48h). After
            activation the old key is revoked on-chain.
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
          onClick={() => onSubmit({ chain, addr })}
        >
          Propose rotation
        </button>
      </div>
    </>
  );
}
