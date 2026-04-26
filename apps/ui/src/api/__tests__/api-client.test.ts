// Tests for api/client.ts — ApiError, registerStepUpHandler, api.get/post/patch/delete,
// step-up interception and retry logic.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, registerStepUpHandler, unregisterStepUpHandler } from '../client';

// ── Global fetch mock ─────────────────────────────────────────────────────────

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', fetchMock);

// Use an absolute base URL so new Request(url) works in Node/jsdom (relative URLs rejected).
vi.mock('@/stores/env-store', () => ({
  getActiveApiBase: vi.fn(() => 'http://localhost'),
}));

function makeResponse(body: unknown, status = 200, statusText = 'OK'): Response {
  const json = JSON.stringify(body);
  return new Response(json, {
    status,
    statusText,
    headers: { 'content-type': 'application/json' },
  });
}

function makeEmptyResponse(status = 204): Response {
  return new Response(null, { status });
}

function makeTextResponse(text: string, status = 500): Response {
  return new Response(text, {
    status,
    statusText: 'Internal Server Error',
    headers: { 'content-type': 'text/plain' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  unregisterStepUpHandler();
});

afterEach(() => {
  unregisterStepUpHandler();
});

// ── ApiError ──────────────────────────────────────────────────────────────────

describe('ApiError', () => {
  it('sets status, message, and name', () => {
    const err = new ApiError(404, 'Not found');
    expect(err.status).toBe(404);
    expect(err.message).toBe('Not found');
    expect(err.name).toBe('ApiError');
  });

  it('sets optional code', () => {
    const err = new ApiError(403, 'Forbidden', 'STEP_UP_REQUIRED');
    expect(err.code).toBe('STEP_UP_REQUIRED');
  });

  it('code is undefined when not provided', () => {
    const err = new ApiError(500, 'Server error');
    expect(err.code).toBeUndefined();
  });

  it('is an instance of Error', () => {
    const err = new ApiError(400, 'Bad request');
    expect(err).toBeInstanceOf(Error);
  });
});

// ── registerStepUpHandler / unregisterStepUpHandler ───────────────────────────

describe('registerStepUpHandler / unregisterStepUpHandler', () => {
  it('registers a handler without throwing', () => {
    expect(() => registerStepUpHandler(async () => {})).not.toThrow();
  });

  it('unregisters the handler without throwing', () => {
    registerStepUpHandler(async () => {});
    expect(() => unregisterStepUpHandler()).not.toThrow();
  });
});

// ── api.get ───────────────────────────────────────────────────────────────────

describe('api.get', () => {
  it('fetches with GET method and credentials:include', async () => {
    fetchMock.mockResolvedValue(makeResponse({ ok: true }));
    await api.get('/test');
    const req = fetchMock.mock.calls[0][0] as Request;
    expect(req.method).toBe('GET');
    expect(req.credentials).toBe('include');
  });

  it('constructs URL from path with /api prefix', async () => {
    fetchMock.mockResolvedValue(makeResponse({ data: [] }));
    await api.get('/users');
    const req = fetchMock.mock.calls[0][0] as Request;
    // base is http://localhost in test, so full URL is http://localhost/api/users
    expect(req.url).toContain('/api/users');
  });

  it('returns parsed JSON response', async () => {
    fetchMock.mockResolvedValue(makeResponse({ id: 'u-1', name: 'Alice' }));
    const result = await api.get<{ id: string; name: string }>('/users/u-1');
    expect(result).toEqual({ id: 'u-1', name: 'Alice' });
  });

  it('throws ApiError on 4xx response with JSON body', async () => {
    fetchMock.mockResolvedValue(
      makeResponse({ message: 'Not found', code: 'NOT_FOUND' }, 404, 'Not Found')
    );
    await expect(api.get('/missing')).rejects.toBeInstanceOf(ApiError);
  });

  it('throws ApiError with correct status on error', async () => {
    fetchMock.mockResolvedValue(
      makeResponse({ message: 'Server error' }, 500, 'Internal Server Error')
    );
    try {
      await api.get('/broken');
    } catch (e) {
      expect((e as ApiError).status).toBe(500);
    }
  });

  it('uses statusText as message when body has no message field', async () => {
    fetchMock.mockResolvedValue(makeTextResponse('not json', 503));
    try {
      await api.get('/oops');
    } catch (e) {
      expect((e as ApiError).message).toBe('Internal Server Error');
    }
  });

  it('returns undefined for 204 No Content', async () => {
    fetchMock.mockResolvedValue(makeEmptyResponse(204));
    const result = await api.get('/empty');
    expect(result).toBeUndefined();
  });
});

// ── api.post ──────────────────────────────────────────────────────────────────

describe('api.post', () => {
  it('fetches with POST method', async () => {
    fetchMock.mockResolvedValue(makeResponse({ jobId: 'j-1' }));
    await api.post('/jobs');
    const req = fetchMock.mock.calls[0][0] as Request;
    expect(req.method).toBe('POST');
  });

  it('sends content-type application/json when body is provided', async () => {
    fetchMock.mockResolvedValue(makeResponse({ ok: true }));
    await api.post('/submit', { value: 42 });
    const req = fetchMock.mock.calls[0][0] as Request;
    expect(req.headers.get('content-type')).toBe('application/json');
  });

  it('serialises body as JSON', async () => {
    fetchMock.mockResolvedValue(makeResponse({ ok: true }));
    await api.post('/submit', { key: 'val' });
    const req = fetchMock.mock.calls[0][0] as Request;
    const text = await req.text();
    expect(JSON.parse(text)).toEqual({ key: 'val' });
  });

  it('omits content-type when no body', async () => {
    fetchMock.mockResolvedValue(makeResponse({ ok: true }));
    await api.post('/trigger');
    const req = fetchMock.mock.calls[0][0] as Request;
    expect(req.headers.get('content-type')).toBeNull();
  });

  it('returns parsed JSON', async () => {
    fetchMock.mockResolvedValue(makeResponse({ created: true }));
    const result = await api.post<{ created: boolean }>('/items', { name: 'x' });
    expect(result).toEqual({ created: true });
  });
});

// ── api.patch ─────────────────────────────────────────────────────────────────

describe('api.patch', () => {
  it('fetches with PATCH method', async () => {
    fetchMock.mockResolvedValue(makeResponse({ updated: true }));
    await api.patch('/items/1', { name: 'y' });
    const req = fetchMock.mock.calls[0][0] as Request;
    expect(req.method).toBe('PATCH');
  });

  it('sends content-type application/json when body provided', async () => {
    fetchMock.mockResolvedValue(makeResponse({ updated: true }));
    await api.patch('/items/1', { active: false });
    const req = fetchMock.mock.calls[0][0] as Request;
    expect(req.headers.get('content-type')).toBe('application/json');
  });

  it('returns parsed JSON', async () => {
    fetchMock.mockResolvedValue(makeResponse({ id: '1', active: false }));
    const result = await api.patch<{ id: string; active: boolean }>('/items/1', { active: false });
    expect(result.active).toBe(false);
  });
});

// ── api.delete ────────────────────────────────────────────────────────────────

describe('api.delete', () => {
  it('fetches with DELETE method', async () => {
    fetchMock.mockResolvedValue(makeEmptyResponse(204));
    await api.delete('/items/1');
    const req = fetchMock.mock.calls[0][0] as Request;
    expect(req.method).toBe('DELETE');
  });

  it('includes credentials', async () => {
    fetchMock.mockResolvedValue(makeEmptyResponse(204));
    await api.delete('/items/1');
    const req = fetchMock.mock.calls[0][0] as Request;
    expect(req.credentials).toBe('include');
  });
});

// ── Step-up interception ──────────────────────────────────────────────────────

describe('step-up interception', () => {
  it('throws ApiError with STEP_UP_REQUIRED when no handler registered', async () => {
    fetchMock.mockResolvedValue(
      makeResponse({ code: 'STEP_UP_REQUIRED', message: 'Step up required' }, 403, 'Forbidden')
    );
    await expect(api.get('/secure')).rejects.toMatchObject({
      code: 'STEP_UP_REQUIRED',
      status: 403,
    });
  });

  it('calls step-up handler then retries when handler is registered', async () => {
    const stepUpHandler = vi.fn().mockResolvedValue(undefined);
    registerStepUpHandler(stepUpHandler);

    fetchMock
      .mockResolvedValueOnce(
        makeResponse({ code: 'STEP_UP_REQUIRED', message: 'Step up required' }, 403, 'Forbidden')
      )
      .mockResolvedValueOnce(makeResponse({ secret: 'data' }));

    const result = await api.get<{ secret: string }>('/secure');
    expect(stepUpHandler).toHaveBeenCalledOnce();
    expect(result).toEqual({ secret: 'data' });
  });

  it('fetch is called twice (original + retry) when step-up succeeds', async () => {
    registerStepUpHandler(vi.fn().mockResolvedValue(undefined));

    fetchMock
      .mockResolvedValueOnce(makeResponse({ code: 'STEP_UP_REQUIRED' }, 403))
      .mockResolvedValueOnce(makeResponse({ ok: true }));

    await api.get('/protected');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws if step-up handler rejects (user cancelled)', async () => {
    registerStepUpHandler(vi.fn().mockRejectedValue(new Error('cancelled')));

    fetchMock.mockResolvedValue(makeResponse({ code: 'STEP_UP_REQUIRED' }, 403));

    await expect(api.get('/protected')).rejects.toThrow('cancelled');
  });

  it('throws ApiError if retry also returns STEP_UP_REQUIRED', async () => {
    registerStepUpHandler(vi.fn().mockResolvedValue(undefined));

    fetchMock
      .mockResolvedValueOnce(makeResponse({ code: 'STEP_UP_REQUIRED' }, 403))
      .mockResolvedValueOnce(makeResponse({ code: 'STEP_UP_REQUIRED' }, 403));

    await expect(api.get('/protected')).rejects.toMatchObject({
      code: 'STEP_UP_REQUIRED',
    });
  });
});
