// Policy Engine HTTP client — wraps POST /v1/check with bearer auth, 2s timeout, fail-closed.
// Fail-closed: any network error or non-2xx response → returns allow:false with reason.
// Uses console for logging (admin-api services do not import pino directly).

/* eslint-disable no-console */
const logger = {
  warn: (...args: unknown[]) => console.warn('[policy-client]', ...args),
  info: (...args: unknown[]) => console.info('[policy-client]', ...args),
};

export interface PolicyCheckRequest {
  operationType: string;
  actorStaffId: string;
  destinationAddr: string;
  amount: string;
  chain: string;
  tier: string;
  signerAddress?: string;
  withdrawalId?: string;
}

export interface PolicyReason {
  rule: string;
  message: string;
}

export interface PolicyCheckResponse {
  allow: boolean;
  reasons: PolicyReason[];
}

export interface PolicyClientOptions {
  baseUrl: string;
  bearerToken: string;
  timeoutMs?: number;
}

/**
 * PolicyRejectedError — thrown by createWithdrawal and approveWithdrawal when
 * the Policy Engine returns allow:false.
 */
export class PolicyRejectedError extends Error {
  readonly statusCode = 403;
  readonly code = 'POLICY_REJECTED';
  readonly reasons: PolicyReason[];

  constructor(reasons: PolicyReason[]) {
    super(`Policy rejected: ${reasons.map((r) => r.message).join('; ')}`);
    this.name = 'PolicyRejectedError';
    this.reasons = reasons;
  }
}

/**
 * Call POST /v1/check on the Policy Engine.
 * Returns allow:false with a synthetic reason on any transport error (fail-closed).
 */
export async function checkPolicy(
  opts: PolicyClientOptions,
  req: PolicyCheckRequest
): Promise<PolicyCheckResponse> {
  const { baseUrl, bearerToken, timeoutMs = 2_000 } = opts;
  const url = `${baseUrl}/v1/check`;

  const body = {
    operation_type: req.operationType,
    actor_staff_id: req.actorStaffId,
    destination_addr: req.destinationAddr,
    amount: req.amount,
    chain: req.chain,
    tier: req.tier,
    signer_address: req.signerAddress ?? '',
    withdrawal_id: req.withdrawalId ?? '',
  };

  let response: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
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
  } catch (err) {
    // Network error or timeout — fail closed
    logger.warn({ err, url }, 'Policy Engine unreachable — failing closed');
    return {
      allow: false,
      reasons: [
        {
          rule: 'policy_engine_unavailable',
          message: 'Policy Engine unreachable — request denied',
        },
      ],
    };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    logger.warn(
      { status: response.status, url, body: text },
      'Policy Engine returned non-2xx — failing closed'
    );
    return {
      allow: false,
      reasons: [{ rule: 'policy_engine_error', message: `Policy Engine error ${response.status}` }],
    };
  }

  // Parse response — policy-engine returns { Allow: bool, Reasons: string[] } (Go JSON capitalised)
  // Map to our camelCase shape.
  const raw = (await response.json()) as {
    Allow?: boolean;
    allow?: boolean;
    Reasons?: string[];
    reasons?: string[];
  };

  const allow = raw.allow ?? raw.Allow ?? false;
  const rawReasons: string[] = raw.reasons ?? raw.Reasons ?? [];

  // Convert string reasons to { rule, message } objects
  const reasons: PolicyReason[] = rawReasons.map((r) => ({
    rule: r.split(':')[0]?.trim() ?? 'policy',
    message: r,
  }));

  logger.info(
    { allow, reasonCount: reasons.length, chain: req.chain, tier: req.tier },
    'Policy check result'
  );
  return { allow, reasons };
}
