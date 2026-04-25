// Unit tests for creditDeposit (Bug 3 regression: empty POST body fix).
// Mocks global.fetch to verify request shape and response handling.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { creditDeposit } from '../services/admin-api-client.js';
import type { AdminApiClientOptions } from '../services/admin-api-client.js';

const OPTS: AdminApiClientOptions = {
  baseUrl: 'https://admin.example.com',
  bearerToken: 'test-bearer-token',
};
const DEPOSIT_ID = 'dep-abc-123';

/** Build a minimal Response mock */
function makeResponse(status: number, ok = status >= 200 && status < 300): Response {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue({}),
    text: vi.fn().mockResolvedValue(''),
  } as unknown as Response;
}

describe('creditDeposit — Bug 3 regression (non-empty POST body)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('sends POST request with non-empty JSON body (not undefined/null/empty string)', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200));

    await creditDeposit(OPTS, DEPOSIT_ID);

    expect(fetch).toHaveBeenCalledOnce();
    const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    // Bug 3: body must not be undefined, null, or empty string — Fastify rejects those with 400
    expect(init.body).toBeDefined();
    expect(init.body).not.toBeNull();
    expect(init.body).not.toBe('');
    // Must be valid JSON
    expect(() => JSON.parse(init.body as string)).not.toThrow();
  });

  it('sends POST to correct URL with Bearer token', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200));

    await creditDeposit(OPTS, DEPOSIT_ID);

    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://admin.example.com/internal/deposits/${DEPOSIT_ID}/credit`);
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-bearer-token');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('URL-encodes depositId with special characters', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200));

    await creditDeposit(OPTS, 'dep/with spaces&special=chars');

    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain(encodeURIComponent('dep/with spaces&special=chars'));
  });

  it('returns { success: true } on 200 response', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(200));

    const result = await creditDeposit(OPTS, DEPOSIT_ID);

    expect(result).toEqual({ success: true, status: 200 });
  });

  it('returns { success: false, status: 409 } on 409 (already credited)', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(409, false));

    const result = await creditDeposit(OPTS, DEPOSIT_ID);

    expect(result).toEqual({ success: false, status: 409 });
  });

  it('returns { success: false, status: 500 } on 500 server error', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(500, false));

    const result = await creditDeposit(OPTS, DEPOSIT_ID);

    expect(result).toEqual({ success: false, status: 500 });
  });

  it('returns { success: false } (no status) on network error without throwing', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await creditDeposit(OPTS, DEPOSIT_ID);

    // Must not throw — returns structured error for caller to handle
    expect(result).toEqual({ success: false });
    expect(result.status).toBeUndefined();
  });
});
