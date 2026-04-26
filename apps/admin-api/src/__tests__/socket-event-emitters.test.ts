import { describe, expect, it, vi } from 'vitest';
// Tests for socket.io event emitter utilities:
//   emit-audit-created.ts, emit-deposit-credited.ts, emit-notif-created.ts
// Strategy: mock socket.io Server with a spy chain.

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeIo() {
  const emit = vi.fn();
  const to = vi.fn().mockReturnValue({ emit });
  const of = vi.fn().mockReturnValue({ emit, to });
  return { of, to, emit };
}

// ── Tests: emitAuditCreated ───────────────────────────────────────────────────

describe('emitAuditCreated', () => {
  it('emits audit.created on /stream namespace with payload', async () => {
    const io = makeIo();
    const { emitAuditCreated } = await import('../events/emit-audit-created.js');

    const payload = {
      id: 'audit-001',
      action: 'user.create',
      resourceType: 'user',
      resourceId: 'user-001',
      staffId: 'staff-001',
      createdAt: '2026-01-15T10:00:00Z',
    };

    emitAuditCreated(io as never, payload);

    expect(io.of).toHaveBeenCalledWith('/stream');
    expect(io.emit).toHaveBeenCalledWith('audit.created', payload);
  });

  it('passes null staffId and resourceId correctly', async () => {
    const io = makeIo();
    const { emitAuditCreated } = await import('../events/emit-audit-created.js');

    emitAuditCreated(io as never, {
      id: 'audit-002',
      action: 'login',
      resourceType: 'session',
      resourceId: null,
      staffId: null,
      createdAt: '2026-01-15T10:00:00Z',
    });

    const emitted = io.emit.mock.calls[0][1];
    expect(emitted.staffId).toBeNull();
    expect(emitted.resourceId).toBeNull();
  });
});

// ── Tests: emitDepositCredited ────────────────────────────────────────────────

describe('emitDepositCredited', () => {
  it('emits deposit.credited on /stream namespace', async () => {
    const io = makeIo();
    const { emitDepositCredited } = await import('../events/emit-deposit-credited.js');

    const result = {
      id: 'dep-001',
      userId: 'user-001',
      chain: 'bnb' as const,
      token: 'USDT' as const,
      amount: '100.00',
      txHash: '0xabc123',
      status: 'credited' as const,
    };

    emitDepositCredited(io as never, result as never);

    expect(io.of).toHaveBeenCalledWith('/stream');
    const emitted = io.emit.mock.calls[0];
    expect(emitted[0]).toBe('deposit.credited');
    expect(emitted[1]).toMatchObject({
      id: 'dep-001',
      chain: 'bnb',
      token: 'USDT',
      amount: '100.00',
    });
  });

  it('includes only non-sensitive fields in payload', async () => {
    const io = makeIo();
    const { emitDepositCredited } = await import('../events/emit-deposit-credited.js');

    emitDepositCredited(
      io as never,
      {
        id: 'dep-002',
        userId: 'user-002',
        chain: 'sol',
        token: 'USDC',
        amount: '50.00',
        txHash: '5xyz...',
        status: 'credited',
      } as never
    );

    const emitted = io.emit.mock.calls[0][1];
    // Should not contain internal audit fields
    expect(Object.keys(emitted)).toEqual([
      'id',
      'userId',
      'chain',
      'token',
      'amount',
      'txHash',
      'status',
    ]);
  });
});

// ── Tests: emitNotifCreated ───────────────────────────────────────────────────

describe('emitNotifCreated', () => {
  it('emits notif.created to staff-private room on /stream', async () => {
    const io = makeIo();
    const { emitNotifCreated } = await import('../events/emit-notif-created.js');

    const row = {
      id: 'notif-001',
      staffId: 'staff-001',
      eventType: 'withdrawal.created',
      severity: 'info',
      title: 'Withdrawal created',
      body: 'USD 100 withdrawal initiated',
      payload: null,
      dedupeKey: null,
      readAt: null,
      createdAt: new Date('2026-01-15T10:00:00Z'),
      digestSentAt: null,
    };

    emitNotifCreated(io as never, row as never);

    expect(io.of).toHaveBeenCalledWith('/stream');
    expect(io.to).toHaveBeenCalledWith('staff:staff-001');
    expect(io.emit).toHaveBeenCalledWith(
      'notif.created',
      expect.objectContaining({
        id: 'notif-001',
        staffId: 'staff-001',
        eventType: 'withdrawal.created',
      })
    );
  });

  it('serialises createdAt as ISO string', async () => {
    const io = makeIo();
    const { emitNotifCreated } = await import('../events/emit-notif-created.js');

    const row = {
      id: 'notif-002',
      staffId: 'staff-001',
      eventType: 'e',
      severity: 'info',
      title: 'T',
      body: null,
      payload: null,
      dedupeKey: null,
      readAt: null,
      createdAt: new Date('2026-01-15T10:00:00Z'),
      digestSentAt: null,
    };

    emitNotifCreated(io as never, row as never);

    const payload = io.emit.mock.calls[0][1];
    expect(payload.createdAt).toBe('2026-01-15T10:00:00.000Z');
    expect(payload.readAt).toBeNull();
  });

  it('serialises readAt as ISO string when set', async () => {
    const io = makeIo();
    const { emitNotifCreated } = await import('../events/emit-notif-created.js');

    const row = {
      id: 'notif-003',
      staffId: 'staff-001',
      eventType: 'e',
      severity: 'info',
      title: 'T',
      body: null,
      payload: null,
      dedupeKey: null,
      readAt: new Date('2026-01-15T11:00:00Z'),
      createdAt: new Date('2026-01-15T10:00:00Z'),
      digestSentAt: null,
    };

    emitNotifCreated(io as never, row as never);

    const payload = io.emit.mock.calls[0][1];
    expect(payload.readAt).toBe('2026-01-15T11:00:00.000Z');
  });
});

// ── Tests: deriveUserAddresses (wallet-engine-client) ─────────────────────────

describe('deriveUserAddresses', () => {
  it('calls wallet-engine derive-addresses endpoint with bearer auth', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        addresses: [
          {
            chain: 'bnb',
            address: '0xHot',
            derivationPath: "m/44'/60'/0'/0/0",
            derivationIndex: 0,
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const { deriveUserAddresses } = await import('../services/wallet-engine-client.js');
    const result = await deriveUserAddresses(
      { baseUrl: 'http://wallet-engine:3001', bearerToken: 'secret-token' },
      'user-001'
    );

    expect(global.fetch).toHaveBeenCalledWith(
      'http://wallet-engine:3001/internal/users/user-001/derive-addresses',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer secret-token' }),
      })
    );
    expect(result.addresses[0]!.chain).toBe('bnb');
  });

  it('throws WalletEngineError on non-2xx response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ message: 'User not found' }),
    }) as unknown as typeof fetch;

    const { deriveUserAddresses, WalletEngineError } = await import(
      '../services/wallet-engine-client.js'
    );
    await expect(
      deriveUserAddresses({ baseUrl: 'http://wallet-engine:3001', bearerToken: 'token' }, 'bad-id')
    ).rejects.toThrow(WalletEngineError);
  });

  it('throws WalletEngineError on network error', async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValue(new TypeError('fetch failed')) as unknown as typeof fetch;

    const { deriveUserAddresses, WalletEngineError } = await import(
      '../services/wallet-engine-client.js'
    );
    await expect(
      deriveUserAddresses(
        { baseUrl: 'http://wallet-engine:3001', bearerToken: 'token' },
        'user-001'
      )
    ).rejects.toThrow(WalletEngineError);
  });

  it('uses statusText when response body is non-JSON', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: async () => {
        throw new Error('not json');
      },
    }) as unknown as typeof fetch;

    const { deriveUserAddresses, WalletEngineError } = await import(
      '../services/wallet-engine-client.js'
    );
    const err = await deriveUserAddresses(
      { baseUrl: 'http://wallet-engine:3001', bearerToken: 'token' },
      'user-001'
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(WalletEngineError);
    expect((err as InstanceType<typeof WalletEngineError>).status).toBe(502);
  });
});
