import type { AdminApiClientOptions } from '../../services/admin-api-client.js';

export async function callSweepBroadcasted(
  opts: AdminApiClientOptions,
  sweepId: string,
  txHash: string
): Promise<void> {
  const url = `${opts.baseUrl}/internal/sweeps/${encodeURIComponent(sweepId)}/broadcasted`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.bearerToken}`,
    },
    body: JSON.stringify({ txHash }),
  });
  if (!res.ok) {
    throw new Error(`POST /internal/sweeps/${sweepId}/broadcasted → ${res.status}`);
  }
}

export async function callSweepConfirmed(
  opts: AdminApiClientOptions,
  sweepId: string
): Promise<void> {
  const url = `${opts.baseUrl}/internal/sweeps/${encodeURIComponent(sweepId)}/confirmed`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.bearerToken}`,
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    throw new Error(`POST /internal/sweeps/${sweepId}/confirmed → ${res.status}`);
  }
}
