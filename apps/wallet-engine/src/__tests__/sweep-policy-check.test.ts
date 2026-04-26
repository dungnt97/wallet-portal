// Tests for queue/workers/sweep-policy-check.ts — 0% coverage.
// checkSweepPolicy: happy path, fail-closed on timeout, non-2xx, Allow/allow variants.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SweepExecuteJobData } from '../queue/sweep-execute.js';

const sweepData: SweepExecuteJobData = {
  sweepId: 'sweep-1',
  userAddressId: 'addr-1',
  derivationIndex: 0,
  chain: 'bnb',
  token: 'USDT',
  amount: '100',
  fromAddr: '0xFrom',
  destinationHotSafe: '0xHot',
};

function makeResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('sweep-policy-check — checkSweepPolicy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns allow=true when policy engine responds { allow: true }', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(200, { allow: true })));
    const { checkSweepPolicy } = await import('../queue/workers/sweep-policy-check.js');
    const result = await checkSweepPolicy('https://policy.test', 'token123', sweepData);
    expect(result.allow).toBe(true);
  });

  it('returns allow=true when policy engine responds { Allow: true } (capital A)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(200, { Allow: true })));
    const { checkSweepPolicy } = await import('../queue/workers/sweep-policy-check.js');
    const result = await checkSweepPolicy('https://policy.test', 'token123', sweepData);
    expect(result.allow).toBe(true);
  });

  it('returns allow=false when policy engine responds { allow: false }', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(200, { allow: false })));
    const { checkSweepPolicy } = await import('../queue/workers/sweep-policy-check.js');
    const result = await checkSweepPolicy('https://policy.test', 'token123', sweepData);
    expect(result.allow).toBe(false);
  });

  it('fails closed (allow=false) when fetch throws (policy engine unreachable)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const { checkSweepPolicy } = await import('../queue/workers/sweep-policy-check.js');
    const result = await checkSweepPolicy('https://policy.test', 'token123', sweepData);
    expect(result.allow).toBe(false);
    expect(result.reason).toBe('policy_engine_unavailable');
  });

  it('fails closed on non-2xx response with reason containing status code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(500, {})));
    const { checkSweepPolicy } = await import('../queue/workers/sweep-policy-check.js');
    const result = await checkSweepPolicy('https://policy.test', 'token123', sweepData);
    expect(result.allow).toBe(false);
    expect(result.reason).toContain('500');
  });

  it('fails closed on 403 Forbidden', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(403, {})));
    const { checkSweepPolicy } = await import('../queue/workers/sweep-policy-check.js');
    const result = await checkSweepPolicy('https://policy.test', 'token123', sweepData);
    expect(result.allow).toBe(false);
    expect(result.reason).toContain('403');
  });

  it('POSTs to /v1/check with correct body shape', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(200, { allow: true })));
    const { checkSweepPolicy } = await import('../queue/workers/sweep-policy-check.js');
    await checkSweepPolicy('https://policy.test', 'token123', sweepData);

    const calls = vi.mocked(fetch).mock.calls as [string, RequestInit][];
    expect(calls[0]?.[0]).toBe('https://policy.test/v1/check');
    expect(calls[0]?.[1].method).toBe('POST');
    const body = JSON.parse(calls[0]?.[1].body as string) as {
      operation_type: string;
      chain: string;
      amount: string;
    };
    expect(body.operation_type).toBe('sweep');
    expect(body.chain).toBe('bnb');
    expect(body.amount).toBe('100');
  });

  it('defaults allow=false when response body has neither allow nor Allow', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(200, {})));
    const { checkSweepPolicy } = await import('../queue/workers/sweep-policy-check.js');
    const result = await checkSweepPolicy('https://policy.test', 'token123', sweepData);
    expect(result.allow).toBe(false);
  });

  it('includes Bearer token in Authorization header', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(200, { allow: true })));
    const { checkSweepPolicy } = await import('../queue/workers/sweep-policy-check.js');
    await checkSweepPolicy('https://policy.test', 'my-bearer-token', sweepData);

    const calls = vi.mocked(fetch).mock.calls as [string, RequestInit][];
    expect((calls[0]?.[1].headers as Record<string, string>).Authorization).toBe(
      'Bearer my-bearer-token'
    );
  });
});
