// Typed fetch client for admin-api internal routes — D4: bearer auth
// Implements authenticated POST calls to /internal/* with Bearer token, structured
// error logging, and non-throwing error returns so callers can decide on retry.
import pino from 'pino';

const logger = pino({ name: 'admin-api-client' });

export interface AdminApiClientOptions {
  baseUrl: string;
  /** SVC_BEARER_TOKEN — shared secret for service-to-service auth */
  bearerToken: string;
}

export interface CreditDepositResult {
  success: boolean;
  status?: number;
}

/**
 * POST /internal/deposits/:id/credit
 * Signals admin-api to credit the deposit to the user's ledger.
 * Returns success:false (non-throwing) on 4xx/5xx so caller can handle retry.
 *
 * Sends an authenticated POST to admin-api. Returns success:false (non-throwing)
 * on 4xx/5xx so the caller can decide whether to retry or dead-letter the job.
 */
export async function creditDeposit(
  opts: AdminApiClientOptions,
  depositId: string
): Promise<CreditDepositResult> {
  const url = `${opts.baseUrl}/internal/deposits/${encodeURIComponent(depositId)}/credit`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.bearerToken}`,
      },
      body: JSON.stringify({}),
    });
  } catch (err) {
    logger.error({ err, depositId }, 'admin-api credit request network error');
    return { success: false };
  }

  if (!response.ok) {
    logger.warn(
      { status: response.status, depositId },
      'admin-api credit request returned non-2xx'
    );
    return { success: false, status: response.status };
  }

  logger.info({ depositId }, 'Deposit credited via admin-api');
  return { success: true, status: response.status };
}
