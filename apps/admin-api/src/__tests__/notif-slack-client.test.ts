// Unit tests for notif-slack-client service — dry-run, live post, error handling.
// Uses vi.stubGlobal to mock fetch — no real HTTP calls required.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { postSlackMessage } from '../services/notif-slack-client.service.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const WEBHOOK_URL = 'https://hooks.slack.com/services/TEST/TEST/TEST';

const BASE_OPTS = {
  text: 'Test alert',
  blocks: [
    { type: 'header' as const, text: { type: 'plain_text' as const, text: 'Test Header' } },
    { type: 'section' as const, text: { type: 'mrkdwn' as const, text: '*Body text*' } },
    { type: 'divider' as const },
  ],
  webhookUrl: WEBHOOK_URL,
};

// ── Mock fetch helper ─────────────────────────────────────────────────────────

function stubFetch(ok: boolean, status = 200, body = 'ok') {
  const mockFetch = vi.fn().mockResolvedValue({
    ok,
    status,
    text: vi.fn().mockResolvedValue(body),
  });
  vi.stubGlobal('fetch', mockFetch);
  return mockFetch;
}

// ── Tests — dry-run mode ──────────────────────────────────────────────────────

describe('postSlackMessage — dry-run mode', () => {
  beforeEach(() => {
    process.env.NOTIFICATIONS_DRY_RUN = 'true';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.NOTIFICATIONS_DRY_RUN = 'true';
  });

  it('does not call fetch in dry-run mode', async () => {
    const mockFetch = stubFetch(true);
    await postSlackMessage(BASE_OPTS);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('resolves without error in dry-run mode', async () => {
    await expect(postSlackMessage(BASE_OPTS)).resolves.toBeUndefined();
  });
});

describe('postSlackMessage — empty webhookUrl', () => {
  it('returns without calling fetch when webhookUrl is empty string', async () => {
    const mockFetch = stubFetch(true);
    await postSlackMessage({ ...BASE_OPTS, webhookUrl: '' });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
});

// ── Tests — live mode ─────────────────────────────────────────────────────────

describe('postSlackMessage — live mode', () => {
  beforeEach(() => {
    process.env.NOTIFICATIONS_DRY_RUN = 'false';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.NOTIFICATIONS_DRY_RUN = 'true';
  });

  it('POSTs JSON payload to webhook URL', async () => {
    const mockFetch = stubFetch(true);
    await postSlackMessage(BASE_OPTS);

    expect(mockFetch).toHaveBeenCalledWith(
      WEBHOOK_URL,
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      })
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.text).toBe('Test alert');
    expect(body.blocks).toHaveLength(3);
  });

  it('throws with masked URL when fetch rejects (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    await expect(postSlackMessage(BASE_OPTS)).rejects.toThrow('Slack webhook request failed');
  });

  it('throws on non-2xx HTTP response', async () => {
    stubFetch(false, 403, 'invalid_token');
    await expect(postSlackMessage(BASE_OPTS)).rejects.toThrow('Slack webhook HTTP 403');
  });

  it('resolves on 200 OK response', async () => {
    stubFetch(true, 200);
    await expect(postSlackMessage(BASE_OPTS)).resolves.toBeUndefined();
  });

  it('does not echo webhook URL in thrown error message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    try {
      await postSlackMessage(BASE_OPTS);
      expect.fail('should have thrown');
    } catch (err) {
      expect((err as Error).message).not.toContain(WEBHOOK_URL);
    }
  });
});
