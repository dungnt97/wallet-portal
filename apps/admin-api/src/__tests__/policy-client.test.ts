// Unit tests for policy-client — mock HTTP server responses to verify
// fail-closed behaviour, timeout handling, and response mapping.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkPolicy } from '../services/policy-client.js';

const BASE_OPTS = {
  baseUrl: 'http://localhost:3003',
  bearerToken: 'test-secret-token-32chars',
  timeoutMs: 500,
};

const VALID_REQ = {
  operationType: 'withdrawal',
  actorStaffId: 'staff-uuid-0001',
  destinationAddr: '0xDeAdBeEf',
  amount: '1000',
  chain: 'bnb',
  tier: 'hot',
};

// ── Fetch mock helpers ────────────────────────────────────────────────────────

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
  });
}

function mockFetchNetworkError() {
  return vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
}

function mockFetchAbort() {
  const err = new Error('The operation was aborted');
  err.name = 'AbortError';
  return vi.fn().mockRejectedValue(err);
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('checkPolicy', () => {
  it('returns allow:true when policy engine approves (Go-style capitalised keys)', async () => {
    vi.stubGlobal('fetch', mockFetch({ Allow: true, Reasons: [] }));

    const result = await checkPolicy(BASE_OPTS, VALID_REQ);

    expect(result.allow).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('returns allow:true when policy engine approves (camelCase keys)', async () => {
    vi.stubGlobal('fetch', mockFetch({ allow: true, reasons: [] }));

    const result = await checkPolicy(BASE_OPTS, VALID_REQ);

    expect(result.allow).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('returns allow:false with mapped reasons when policy denies', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        Allow: false,
        Reasons: [
          'daily_limit: Daily limit of 50000 exceeded',
          'destination_whitelist: Address not whitelisted',
        ],
      })
    );

    const result = await checkPolicy(BASE_OPTS, VALID_REQ);

    expect(result.allow).toBe(false);
    expect(result.reasons).toHaveLength(2);
    expect(result.reasons[0]).toMatchObject({
      rule: 'daily_limit',
      message: expect.stringContaining('Daily limit'),
    });
  });

  it('fails closed on network error — returns allow:false', async () => {
    vi.stubGlobal('fetch', mockFetchNetworkError());

    const result = await checkPolicy(BASE_OPTS, VALID_REQ);

    expect(result.allow).toBe(false);
    expect(result.reasons[0]?.rule).toBe('policy_engine_unavailable');
  });

  it('fails closed on abort (timeout) — returns allow:false', async () => {
    vi.stubGlobal('fetch', mockFetchAbort());

    const result = await checkPolicy(BASE_OPTS, VALID_REQ);

    expect(result.allow).toBe(false);
    expect(result.reasons[0]?.rule).toBe('policy_engine_unavailable');
  });

  it('fails closed on non-2xx response — returns allow:false with policy_engine_error rule', async () => {
    vi.stubGlobal('fetch', mockFetch({ error: 'internal error' }, 500));

    const result = await checkPolicy(BASE_OPTS, VALID_REQ);

    expect(result.allow).toBe(false);
    expect(result.reasons[0]?.rule).toBe('policy_engine_error');
  });

  it('sends Authorization bearer header', async () => {
    const fetchSpy = mockFetch({ Allow: true, Reasons: [] });
    vi.stubGlobal('fetch', fetchSpy);

    await checkPolicy(BASE_OPTS, VALID_REQ);

    const [_url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${BASE_OPTS.bearerToken}`
    );
  });

  it('maps request fields to snake_case body', async () => {
    const fetchSpy = mockFetch({ Allow: true, Reasons: [] });
    vi.stubGlobal('fetch', fetchSpy);

    await checkPolicy(BASE_OPTS, {
      ...VALID_REQ,
      signerAddress: '0xABC',
      withdrawalId: 'wd-001',
    });

    const [_url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, string>;
    expect(body.actor_staff_id).toBe('staff-uuid-0001');
    expect(body.signer_address).toBe('0xABC');
    expect(body.withdrawal_id).toBe('wd-001');
    expect(body.destination_addr).toBe('0xDeAdBeEf');
  });
});
