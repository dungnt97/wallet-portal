// Signer / Treasurer governance fixtures — active set, retired set, and the
// signer-change-request queue (add/remove/rotate).
import { minutesAgo } from '../helpers';

export interface SignerRow {
  id: string;
  name: string;
  email: string;
  initials: string;
  evmAddr: string;
  solAddr: string | null;
  active: boolean;
}

export interface RetiredSigner {
  id: string;
  name: string;
  email: string;
  initials: string;
  evmAddr: string;
  removedAt: string;
  removedReason: string;
}

export type ChangeKind = 'add' | 'rotate' | 'remove';
export type ChangeStatus = 'awaiting_signatures' | 'executed';

export interface SignerChangeRequest {
  id: string;
  kind: ChangeKind;
  target: string;
  label: string;
  proposedBy: string;
  proposedAt: string;
  collected: number;
  required: number;
  approvers: string[];
  status: ChangeStatus;
  executedAt?: string | null;
  txHash?: string | null;
  meta?: {
    from?: string;
    to?: string;
    chain?: 'evm' | 'sol';
    reason?: string;
    name?: string;
    email?: string;
    evmAddr?: string;
    solAddr?: string;
  };
}

export const ACTIVE_SIGNERS: SignerRow[] = [
  {
    id: 'stf_ben',
    name: 'Ben Foster',
    email: 'ben@treasury.io',
    initials: 'BF',
    evmAddr: '0x4a2b7c8d6e3f1a9b5c4d8e7f2a6b1c9d3e8f4a7b',
    solAddr: 'BnFvW2xK8mQpRt6LsN4jUa7HhZ9eY3gXcXyC5vTbKmPy',
    active: true,
  },
  {
    id: 'stf_hana',
    name: 'Hana Petersen',
    email: 'hana@treasury.io',
    initials: 'HP',
    evmAddr: '0x7c4d9e2f6a1b8c5d3e7f4a9b2c6d1e8f5a3b7c9d',
    solAddr: 'HpT3sR9xKmQnLt8VsN2jUa5HhZ7eY4gXcXyC6vTbKmPz',
    active: true,
  },
  {
    id: 'stf_ana',
    name: 'Ana Müller',
    email: 'ana@treasury.io',
    initials: 'AM',
    evmAddr: '0x9e3f5a7b2c4d8e6f1a9b3c7d5e2f8a4b6c1d9e3f',
    solAddr: 'AmL5tR8xKmQnVt3HsN6jUa2HhZ4eY8gXcXyC9vTbKmPq',
    active: true,
  },
];

export const RETIRED_SIGNERS: RetiredSigner[] = [
  {
    id: 'stf_old_1',
    name: 'Jonas Koenig',
    email: 'jonas@treasury.io (revoked)',
    initials: 'JK',
    evmAddr: `0x${'11'.repeat(20)}`,
    removedAt: minutesAgo(60 * 24 * 7),
    removedReason: 'Left company — offboarding',
  },
];

export const SIGNER_CHANGE_REQUESTS: SignerChangeRequest[] = [
  {
    id: 'sc_001',
    kind: 'add',
    target: 'stf_new_1',
    label: 'Add Elif Demir as Treasurer',
    proposedBy: 'stf_mira',
    proposedAt: minutesAgo(35),
    collected: 1,
    required: 2,
    approvers: ['stf_ben'],
    status: 'awaiting_signatures',
  },
  {
    id: 'sc_002',
    kind: 'rotate',
    target: 'stf_ana',
    label: 'Rotate Ana Müller — EVM key',
    proposedBy: 'stf_mira',
    proposedAt: minutesAgo(60 * 18),
    collected: 2,
    required: 2,
    approvers: ['stf_ben', 'stf_hana'],
    status: 'executed',
    executedAt: minutesAgo(60 * 17),
    txHash: `0x${'ab'.repeat(32)}`,
  },
  {
    id: 'sc_003',
    kind: 'remove',
    target: 'stf_old_1',
    label: 'Remove former Treasurer · Jonas K.',
    proposedBy: 'stf_mira',
    proposedAt: minutesAgo(60 * 24 * 7),
    collected: 2,
    required: 2,
    approvers: ['stf_ben', 'stf_ana'],
    status: 'executed',
    executedAt: minutesAgo(60 * 24 * 7 - 120),
    txHash: `0x${'cd'.repeat(32)}`,
  },
];
