// Hook encapsulating local mutation flow for signer change requests.
// Keeps signers-page lean: add / rotate / remove / sign all live here.
import { useAuth } from '@/auth/use-auth';
import { useToast } from '@/components/overlays';
import { useState } from 'react';
import {
  SIGNER_CHANGE_REQUESTS,
  type SignerChangeRequest,
  type SignerRow,
} from './signers-fixtures';

export function useSignerChanges() {
  const { staff } = useAuth();
  const toast = useToast();
  const [changes, setChanges] = useState<SignerChangeRequest[]>(SIGNER_CHANGE_REQUESTS);

  const sign = (c: SignerChangeRequest) => {
    if (!staff) return;
    if (staff.role !== 'treasurer' && staff.role !== 'admin') {
      toast('Only Treasurers can sign.', 'error');
      return;
    }
    if (c.approvers.includes(staff.id)) {
      toast('Already signed.');
      return;
    }
    const approvers = [...c.approvers, staff.id];
    const collected = approvers.length;
    const ready = collected >= c.required;
    const updated: SignerChangeRequest = {
      ...c,
      approvers,
      collected,
      status: ready ? 'executed' : 'awaiting_signatures',
      executedAt: ready ? new Date().toISOString() : null,
      txHash: ready ? `0x${Math.random().toString(16).slice(2).padEnd(64, '0')}` : null,
    };
    setChanges((prev) => prev.map((x) => (x.id === c.id ? updated : x)));
    toast(
      ready ? `Change ${c.id} executed on-chain.` : `Signed ${c.id} (${collected}/${c.required}).`,
      'success'
    );
  };

  const proposeAdd = (p: {
    name: string;
    email: string;
    evmAddr: string;
    solAddr: string;
  }) => {
    if (!staff) return;
    const req: SignerChangeRequest = {
      id: `sc_${Math.floor(Math.random() * 9000 + 1000)}`,
      kind: 'add',
      target: `stf_new_${Date.now().toString(36).slice(-4)}`,
      label: `Add ${p.name} as Treasurer`,
      proposedBy: staff.id,
      proposedAt: new Date().toISOString(),
      collected: 0,
      required: 2,
      approvers: [],
      status: 'awaiting_signatures',
      meta: p,
    };
    setChanges((prev) => [req, ...prev]);
    toast(`Change request ${req.id} created — awaiting 2 Treasurer signatures.`, 'success');
  };

  const proposeRotate = (signer: SignerRow, data: { chain: 'evm' | 'sol'; addr: string }) => {
    if (!staff) return;
    const req: SignerChangeRequest = {
      id: `sc_${Math.floor(Math.random() * 9000 + 1000)}`,
      kind: 'rotate',
      target: signer.id,
      label: `Rotate ${signer.name} — ${data.chain.toUpperCase()} key`,
      proposedBy: staff.id,
      proposedAt: new Date().toISOString(),
      collected: 0,
      required: 2,
      approvers: [],
      status: 'awaiting_signatures',
      meta: {
        from: (data.chain === 'evm' ? signer.evmAddr : signer.solAddr) ?? undefined,
        to: data.addr,
        chain: data.chain,
      },
    };
    setChanges((prev) => [req, ...prev]);
    toast('Key rotation proposed — awaiting 2 signatures.', 'success');
  };

  const proposeRemove = (signer: SignerRow, reason: string) => {
    if (!staff) return;
    const req: SignerChangeRequest = {
      id: `sc_${Math.floor(Math.random() * 9000 + 1000)}`,
      kind: 'remove',
      target: signer.id,
      label: `Remove ${signer.name} from Treasurer set`,
      proposedBy: staff.id,
      proposedAt: new Date().toISOString(),
      collected: 0,
      required: 2,
      approvers: [],
      status: 'awaiting_signatures',
      meta: { reason },
    };
    setChanges((prev) => [req, ...prev]);
    toast('Removal proposed — awaiting 2 signatures.', 'success');
  };

  return {
    changes,
    activeChanges: changes.filter((c) => c.status === 'awaiting_signatures'),
    history: changes.filter((c) => c.status !== 'awaiting_signatures'),
    sign,
    proposeAdd,
    proposeRotate,
    proposeRemove,
  };
}
