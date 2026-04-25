/**
 * Admin-API polling helpers for testnet e2e tests.
 *
 * Instead of relying solely on Socket.io real-time updates (which add
 * complexity and can be flaky), these helpers poll the REST API directly
 * until the expected state is reached or the timeout expires.
 *
 * All functions implement exponential backoff between retries.
 */
import type { Page } from '@playwright/test';

import { sleep } from './testnet-chain-client.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type DepositStatus = 'pending' | 'confirming' | 'credited' | 'swept' | 'failed';
export type WithdrawalStatus = 'pending' | 'approved' | 'broadcasted' | 'confirmed' | 'rejected';
export type SweepStatus = 'pending' | 'broadcasting' | 'confirmed' | 'failed';

export interface DepositRecord {
  id: string;
  status: DepositStatus;
  amount: string;
  token: string;
  chain: string;
  txHash: string | null;
  userAddress: string;
  createdAt: string;
}

export interface WithdrawalRecord {
  id: string;
  status: WithdrawalStatus;
  amount: string;
  token: string;
  chain: string;
  recipientAddress: string;
  txHash: string | null;
  approvals: number;
  requiredApprovals: number;
}

export interface SweepBatchRecord {
  id: string;
  status: SweepStatus;
  txHash: string | null;
  depositIds: string[];
  chain: string;
  gasUsed: string | null;
}

export interface ReconciliationSnapshot {
  id: string;
  chain: string;
  onChainBalance: string;
  dbBalance: string;
  drift: string;
  createdAt: string;
}

// ── Polling core ──────────────────────────────────────────────────────────────

/**
 * Poll an admin-API endpoint via the Playwright browser context (shares session cookies).
 * Returns parsed JSON or throws on non-2xx.
 */
async function apiGet<T>(page: Page, adminApiUrl: string, path: string): Promise<T> {
  const response = await page.context().request.get(`${adminApiUrl}${path}`);
  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`[api-poller] GET ${path} → ${response.status()}: ${body}`);
  }
  return response.json() as Promise<T>;
}

async function apiPost<T>(
  page: Page,
  adminApiUrl: string,
  path: string,
  body: unknown
): Promise<T> {
  const response = await page.context().request.post(`${adminApiUrl}${path}`, {
    data: body,
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok()) {
    const text = await response.text();
    throw new Error(`[api-poller] POST ${path} → ${response.status()}: ${text}`);
  }
  return response.json() as Promise<T>;
}

// ── Deposit polling ───────────────────────────────────────────────────────────

/**
 * Poll /deposits until a deposit with the given txHash appears AND its status
 * matches the expected value. Uses exponential backoff between polls.
 *
 * Typical wait times:
 *   BNB:  deposit-confirm job runs after 12 blocks (~36s) — allow 120s
 *   SOL:  ~8s after tx confirmation — allow 60s
 */
export async function pollDepositByTxHash(
  page: Page,
  adminApiUrl: string,
  txHash: string,
  expectedStatus: DepositStatus,
  timeoutMs = 120_000,
  initialDelayMs = 3_000
): Promise<DepositRecord> {
  const deadline = Date.now() + timeoutMs;
  let delay = initialDelayMs;

  await sleep(initialDelayMs); // initial wait — watcher needs time to see the tx

  while (Date.now() < deadline) {
    const { data } = await apiGet<{ data: DepositRecord[] }>(
      page,
      adminApiUrl,
      `/deposits?txHash=${encodeURIComponent(txHash)}&limit=5`
    ).catch(() => ({ data: [] as DepositRecord[] }));

    const match = data.find((d) => d.txHash === txHash);
    if (match) {
      if (match.status === expectedStatus) {
        console.log(
          `[poll-deposit] txHash=${txHash} reached status=${expectedStatus} in deposit id=${match.id}`
        );
        return match;
      }
      if (match.status === 'failed') {
        throw new Error(
          `[poll-deposit] Deposit ${match.id} failed on chain — cannot reach ${expectedStatus}`
        );
      }
      console.log(
        `[poll-deposit] txHash=${txHash} current=${match.status}, waiting for ${expectedStatus}...`
      );
    } else {
      console.log(`[poll-deposit] txHash=${txHash} not yet in DB, retrying...`);
    }

    await sleep(Math.min(delay, 10_000));
    delay = Math.min(delay * 1.5, 10_000); // exponential backoff capped at 10s
  }

  throw new Error(
    `[poll-deposit] Timeout after ${timeoutMs}ms: txHash=${txHash} never reached status=${expectedStatus}`
  );
}

/**
 * Poll /deposits/:id until its status matches expectedStatus.
 * Use this when you already know the deposit ID.
 */
export async function pollDepositById(
  page: Page,
  adminApiUrl: string,
  depositId: string,
  expectedStatus: DepositStatus,
  timeoutMs = 120_000
): Promise<DepositRecord> {
  const deadline = Date.now() + timeoutMs;
  let delay = 3_000;

  while (Date.now() < deadline) {
    const deposit = await apiGet<DepositRecord>(
      page,
      adminApiUrl,
      `/deposits/${depositId}`
    ).catch(() => null);

    if (deposit) {
      if (deposit.status === expectedStatus) {
        console.log(`[poll-deposit] id=${depositId} reached status=${expectedStatus}`);
        return deposit;
      }
      if (deposit.status === 'failed') {
        throw new Error(`[poll-deposit] Deposit ${depositId} failed`);
      }
      console.log(
        `[poll-deposit] id=${depositId} current=${deposit.status}, waiting for ${expectedStatus}...`
      );
    }

    await sleep(Math.min(delay, 10_000));
    delay = Math.min(delay * 1.5, 10_000);
  }

  throw new Error(
    `[poll-deposit] Timeout after ${timeoutMs}ms: id=${depositId} never reached ${expectedStatus}`
  );
}

// ── Withdrawal polling ────────────────────────────────────────────────────────

/** Poll /withdrawals/:id until status matches. */
export async function pollWithdrawalById(
  page: Page,
  adminApiUrl: string,
  withdrawalId: string,
  expectedStatus: WithdrawalStatus,
  timeoutMs = 180_000
): Promise<WithdrawalRecord> {
  const deadline = Date.now() + timeoutMs;
  let delay = 2_000;

  while (Date.now() < deadline) {
    const record = await apiGet<WithdrawalRecord>(
      page,
      adminApiUrl,
      `/withdrawals/${withdrawalId}`
    ).catch(() => null);

    if (record) {
      if (record.status === expectedStatus) {
        console.log(`[poll-withdrawal] id=${withdrawalId} reached status=${expectedStatus}`);
        return record;
      }
      if (record.status === 'rejected') {
        throw new Error(`[poll-withdrawal] Withdrawal ${withdrawalId} was rejected`);
      }
      console.log(
        `[poll-withdrawal] id=${withdrawalId} current=${record.status}, waiting for ${expectedStatus}...`
      );
    }

    await sleep(Math.min(delay, 8_000));
    delay = Math.min(delay * 1.5, 8_000);
  }

  throw new Error(
    `[poll-withdrawal] Timeout after ${timeoutMs}ms: id=${withdrawalId} never reached ${expectedStatus}`
  );
}

/** Submit a withdrawal approval via admin-API (simulates treasurer action). */
export async function submitWithdrawalApproval(
  page: Page,
  adminApiUrl: string,
  withdrawalId: string,
  treasurerEmail: string
): Promise<void> {
  // Establish a separate session as the treasurer, approve, then restore
  await page.context().request.post(`${adminApiUrl}/auth/session/dev-login`, {
    data: { email: treasurerEmail },
  });
  await apiPost(page, adminApiUrl, `/withdrawals/${withdrawalId}/approve`, {});
  console.log(`[api-approval] withdrawal=${withdrawalId} approved by ${treasurerEmail}`);
}

// ── Sweep polling ─────────────────────────────────────────────────────────────

/** Poll /sweeps/:id until status matches. */
export async function pollSweepById(
  page: Page,
  adminApiUrl: string,
  sweepId: string,
  expectedStatus: SweepStatus,
  timeoutMs = 180_000
): Promise<SweepBatchRecord> {
  const deadline = Date.now() + timeoutMs;
  let delay = 3_000;

  while (Date.now() < deadline) {
    const record = await apiGet<SweepBatchRecord>(
      page,
      adminApiUrl,
      `/sweeps/${sweepId}`
    ).catch(() => null);

    if (record) {
      if (record.status === expectedStatus) {
        console.log(`[poll-sweep] id=${sweepId} reached status=${expectedStatus}`);
        return record;
      }
      if (record.status === 'failed') {
        throw new Error(`[poll-sweep] Sweep ${sweepId} failed on chain`);
      }
      console.log(
        `[poll-sweep] id=${sweepId} current=${record.status}, waiting for ${expectedStatus}...`
      );
    }

    await sleep(Math.min(delay, 10_000));
    delay = Math.min(delay * 1.5, 10_000);
  }

  throw new Error(
    `[poll-sweep] Timeout after ${timeoutMs}ms: id=${sweepId} never reached ${expectedStatus}`
  );
}

// ── Reconciliation ────────────────────────────────────────────────────────────

/** Create a reconciliation snapshot via admin-API and return its ID. */
export async function createReconciliationSnapshot(
  page: Page,
  adminApiUrl: string,
  chain: 'bnb' | 'sol'
): Promise<ReconciliationSnapshot> {
  const snapshot = await apiPost<ReconciliationSnapshot>(
    page,
    adminApiUrl,
    '/reconciliation/snapshots',
    { chain }
  );
  console.log(
    `[recon] Created snapshot id=${snapshot.id} chain=${chain} drift=${snapshot.drift}`
  );
  return snapshot;
}

/** Fetch the latest reconciliation snapshots for a chain. */
export async function getLatestSnapshots(
  page: Page,
  adminApiUrl: string,
  chain: 'bnb' | 'sol',
  limit = 5
): Promise<ReconciliationSnapshot[]> {
  const { data } = await apiGet<{ data: ReconciliationSnapshot[] }>(
    page,
    adminApiUrl,
    `/reconciliation/snapshots?chain=${chain}&limit=${limit}`
  );
  return data;
}
