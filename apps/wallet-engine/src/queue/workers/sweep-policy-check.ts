import pino from 'pino';
import type { SweepExecuteJobData } from '../sweep-execute.js';

const logger = pino({ name: 'sweep-policy-check' });

export interface PolicyCheckResult {
  allow: boolean;
  reason?: string;
}

export async function checkSweepPolicy(
  policyBaseUrl: string,
  bearerToken: string,
  data: SweepExecuteJobData
): Promise<PolicyCheckResult> {
  const url = `${policyBaseUrl}/v1/check`;
  const body = {
    operation_type: 'sweep',
    actor_staff_id: '',
    destination_addr: data.destinationHotSafe,
    amount: data.amount,
    chain: data.chain,
    tier: 'hot',
    signer_address: '',
    withdrawal_id: '',
  };

  let response: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2_000);
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearerToken}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch {
    logger.warn({ sweepId: data.sweepId }, 'Policy Engine unreachable — failing closed');
    return { allow: false, reason: 'policy_engine_unavailable' };
  }

  if (!response.ok) {
    logger.warn({ sweepId: data.sweepId, status: response.status }, 'Policy Engine non-2xx');
    return { allow: false, reason: `policy_engine_error_${response.status}` };
  }

  const raw = (await response.json()) as { Allow?: boolean; allow?: boolean };
  const allow = raw.allow ?? raw.Allow ?? false;
  return { allow };
}
