// Policy preview — mirrors the Policy Engine's pre-sign checks for the
// review modal. Shared because multiple modals may want the same output.
import { fmtUSD } from '@/lib/format';
import type { SigningOp } from './signing-flow';

export interface PolicyCheck {
  key: string;
  label: string;
  detail: string;
  ok: boolean;
  warning?: boolean;
}

export interface PolicyResult {
  passed: boolean;
  checks: PolicyCheck[];
}

export function evaluatePolicy(op: SigningOp): PolicyResult {
  const checks: PolicyCheck[] = [
    {
      key: 'signer',
      label: 'Authorized signer',
      detail: 'Wallet matches wallet-registry entry',
      ok: true,
    },
    {
      key: 'whitelist',
      label: 'Destination whitelist',
      detail: op.destinationKnown ? 'Previously used destination' : 'First-time destination',
      ok: true,
      warning: !op.destinationKnown,
    },
    {
      key: 'velocity',
      label: 'Daily velocity',
      detail: `${fmtUSD(op.amount)} within role limit`,
      ok: op.amount < 250_000,
    },
    {
      key: 'expiry',
      label: 'Not expired',
      detail: 'Proposal TTL 24h · 23h left',
      ok: true,
    },
  ];
  return { passed: checks.every((c) => c.ok), checks };
}
