// Tests for queue/workers/sweep-admin-notifier.ts
// callSweepBroadcasted and callSweepConfirmed — 0% coverage.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function makeResponse(status: number, body: unknown = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

const opts = { baseUrl: 'https://admin.test', bearerToken: 'svc-token-abc12345' };

describe('sweep-admin-notifier — callSweepBroadcasted', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POST to /internal/sweeps/:id/broadcasted with txHash', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(200)));
    const { callSweepBroadcasted } = await import('../queue/workers/sweep-admin-notifier.js');
    await callSweepBroadcasted(opts, 'sweep-1', '0xmyTxHash');

    const calls = vi.mocked(fetch).mock.calls as [string, RequestInit][];
    expect(calls[0]?.[0]).toContain('/internal/sweeps/sweep-1/broadcasted');
    expect(calls[0]?.[1].method).toBe('POST');
    const body = JSON.parse(calls[0]?.[1].body as string) as { txHash: string };
    expect(body.txHash).toBe('0xmyTxHash');
  });

  it('includes Bearer token in Authorization header', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(200)));
    const { callSweepBroadcasted } = await import('../queue/workers/sweep-admin-notifier.js');
    await callSweepBroadcasted(opts, 'sweep-1', '0xhash');

    const calls = vi.mocked(fetch).mock.calls as [string, RequestInit][];
    expect((calls[0]?.[1].headers as Record<string, string>).Authorization).toBe(
      'Bearer svc-token-abc12345'
    );
  });

  it('throws on non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(500)));
    const { callSweepBroadcasted } = await import('../queue/workers/sweep-admin-notifier.js');
    await expect(callSweepBroadcasted(opts, 'sweep-err', '0xhash')).rejects.toThrow('500');
  });

  it('URL-encodes sweepId with special characters', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(200)));
    const { callSweepBroadcasted } = await import('../queue/workers/sweep-admin-notifier.js');
    await callSweepBroadcasted(opts, 'sweep/with-slash', '0xhash');
    const calls = vi.mocked(fetch).mock.calls as [string][];
    expect(calls[0]?.[0]).toContain('sweep%2Fwith-slash');
  });
});

describe('sweep-admin-notifier — callSweepConfirmed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POST to /internal/sweeps/:id/confirmed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(200)));
    const { callSweepConfirmed } = await import('../queue/workers/sweep-admin-notifier.js');
    await callSweepConfirmed(opts, 'sweep-2');

    const calls = vi.mocked(fetch).mock.calls as [string, RequestInit][];
    expect(calls[0]?.[0]).toContain('/internal/sweeps/sweep-2/confirmed');
    expect(calls[0]?.[1].method).toBe('POST');
  });

  it('throws on non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(404)));
    const { callSweepConfirmed } = await import('../queue/workers/sweep-admin-notifier.js');
    await expect(callSweepConfirmed(opts, 'sweep-missing')).rejects.toThrow('404');
  });
});
