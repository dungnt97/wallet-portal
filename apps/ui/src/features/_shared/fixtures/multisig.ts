// Multisig operation fixtures — derived from pending withdrawals + vault metadata.
import { evmAddr, mul32, solAddr } from './random';
import { FIX_WITHDRAWALS } from './withdrawals';

const rand = mul32(0x9abc);

// Multisig ops = withdrawals in signing / ready stage.
export const FIX_MULTISIG_OPS = FIX_WITHDRAWALS.filter(
  (w) => w.stage !== 'draft' && w.stage !== 'completed'
).map((w, i) => ({
  id: `op_${(40000 + i).toString(36)}`,
  withdrawalId: w.id,
  chain: w.chain,
  token: w.token,
  amount: w.amount,
  destination: w.destination,
  safeAddress: w.chain === 'bnb' ? evmAddr(rand) : solAddr(rand),
  safeName: w.chain === 'bnb' ? 'BSC Treasury Safe' : 'Solana Squads Vault',
  nonce: 100 + i * 3,
  required: w.multisig.required,
  total: w.multisig.total,
  collected: w.multisig.collected,
  approvers: w.multisig.approvers,
  status: w.stage === 'failed' ? 'failed' : w.stage === 'executing' ? 'ready' : 'collecting',
  createdAt: w.createdAt,
  rejectedBy: null as string | null,
}));
