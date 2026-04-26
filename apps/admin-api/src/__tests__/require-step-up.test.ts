import type { FastifyReply, FastifyRequest } from 'fastify';
// Unit tests for requireStepUp middleware
// Verifies: unauthenticated → 401, no step-up → 403, expired → 403, valid → pass
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requireStepUp } from '../auth/require-step-up.middleware.js';

// preHandlerHookHandler types `this` as FastifyInstance, which causes TS2684 when calling
// directly in tests. We cast the handler to a context-free function signature for testing.
type PlainHandler = (req: FastifyRequest, reply: FastifyReply, next: () => void) => Promise<void>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(
  staff?: FastifyRequest['session']['staff'],
  steppedUpAt?: string
): Partial<FastifyRequest> {
  return {
    session: { staff, steppedUpAt } as FastifyRequest['session'],
  };
}

// Minimal reply stub — avoids complex Fastify type augmentation
type ReplyStub = {
  _status: number | null;
  _body: unknown;
  code: (status: number) => ReplyStub;
  send: (body: unknown) => ReplyStub;
};

function makeReply(): ReplyStub {
  const stub: ReplyStub = {
    _status: null,
    _body: null,
    code(status: number) {
      stub._status = status;
      return stub;
    },
    send(body: unknown) {
      stub._body = body;
      return stub;
    },
  };
  return stub;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('requireStepUp middleware', () => {
  let handler: PlainHandler;
  let savedDevMode: string | undefined;

  beforeEach(() => {
    // Ensure POLICY_DEV_MODE bypass is off — tests must exercise real enforcement logic
    savedDevMode = process.env.POLICY_DEV_MODE;
    process.env.POLICY_DEV_MODE = undefined;
    handler = requireStepUp() as unknown as PlainHandler;
  });

  afterEach(() => {
    // Restore original env value
    if (savedDevMode !== undefined) {
      process.env.POLICY_DEV_MODE = savedDevMode;
    } else {
      process.env.POLICY_DEV_MODE = undefined;
    }
  });

  it('returns 401 when staff is not in session', async () => {
    const req = makeRequest(undefined, undefined);
    const reply = makeReply();
    await handler(
      req as FastifyRequest,
      reply as unknown as FastifyReply,
      vi.fn() as unknown as () => void
    );
    expect(reply._status).toBe(401);
    expect(reply._body).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('returns 403 STEP_UP_REQUIRED when steppedUpAt is absent', async () => {
    const req = makeRequest({ id: '1', email: 'a@b.com', name: 'A', role: 'admin' }, undefined);
    const reply = makeReply();
    await handler(
      req as FastifyRequest,
      reply as unknown as FastifyReply,
      vi.fn() as unknown as () => void
    );
    expect(reply._status).toBe(403);
    expect(reply._body).toMatchObject({ code: 'STEP_UP_REQUIRED' });
  });

  it('returns 403 STEP_UP_REQUIRED when steppedUpAt is older than 5 minutes', async () => {
    const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    const req = makeRequest({ id: '1', email: 'a@b.com', name: 'A', role: 'admin' }, sixMinutesAgo);
    const reply = makeReply();
    await handler(
      req as FastifyRequest,
      reply as unknown as FastifyReply,
      vi.fn() as unknown as () => void
    );
    expect(reply._status).toBe(403);
    expect(reply._body).toMatchObject({ code: 'STEP_UP_REQUIRED' });
  });

  it('does not call reply when steppedUpAt is within 5 minutes', async () => {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const req = makeRequest({ id: '1', email: 'a@b.com', name: 'A', role: 'admin' }, twoMinutesAgo);
    const reply = makeReply();
    const next = vi.fn();
    await handler(
      req as FastifyRequest,
      reply as unknown as FastifyReply,
      next as unknown as () => void
    );
    // Middleware falls through — no reply sent
    expect(reply._status).toBeNull();
    expect(reply._body).toBeNull();
  });

  it('treats steppedUpAt just past 5 min boundary as expired', async () => {
    const justExpired = new Date(Date.now() - 5 * 60 * 1000 - 1).toISOString();
    const req = makeRequest({ id: '1', email: 'a@b.com', name: 'A', role: 'admin' }, justExpired);
    const reply = makeReply();
    await handler(
      req as FastifyRequest,
      reply as unknown as FastifyReply,
      vi.fn() as unknown as () => void
    );
    expect(reply._status).toBe(403);
    expect(reply._body).toMatchObject({ code: 'STEP_UP_REQUIRED' });
  });
});
