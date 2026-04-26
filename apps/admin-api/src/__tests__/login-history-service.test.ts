import { beforeEach, describe, expect, it, vi } from 'vitest';
// Tests for login-history.service.ts
// recordLogin: inserts row, swallows DB errors, logs on error

describe('recordLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts a login history row on success', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
    const db = { insert: mockInsert } as never;

    const { recordLogin } = await import('../services/login-history.service.js');
    await recordLogin(db, { staffId: 'staff-1', success: true, ip: '1.2.3.4', ua: 'Mozilla' });

    expect(mockInsert).toHaveBeenCalledOnce();
    const valuesCall = mockInsert.mock.results[0]!.value.values.mock.calls[0]![0];
    expect(valuesCall.staffId).toBe('staff-1');
    expect(valuesCall.success).toBe(true);
    expect(valuesCall.ipAddress).toBe('1.2.3.4');
  });

  it('inserts with null staffId when not provided', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
    const { recordLogin } = await import('../services/login-history.service.js');
    await recordLogin({ insert: mockInsert } as never, {
      staffId: null,
      success: false,
      ip: null,
      ua: null,
    });

    const valuesCall = mockInsert.mock.results[0]!.value.values.mock.calls[0]![0];
    expect(valuesCall.staffId).toBeUndefined();
    expect(valuesCall.success).toBe(false);
  });

  it('records failure reason when provided', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
    const { recordLogin } = await import('../services/login-history.service.js');
    await recordLogin({ insert: mockInsert } as never, {
      staffId: null,
      success: false,
      ip: null,
      ua: null,
      failureReason: 'DOMAIN_NOT_ALLOWED',
    });

    const valuesCall = mockInsert.mock.results[0]!.value.values.mock.calls[0]![0];
    expect(valuesCall.failureReason).toBe('DOMAIN_NOT_ALLOWED');
  });

  it('swallows DB errors without throwing', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error('DB connection lost')),
    });
    const { recordLogin } = await import('../services/login-history.service.js');

    await expect(
      recordLogin({ insert: mockInsert } as never, {
        staffId: null,
        success: false,
        ip: null,
        ua: null,
      })
    ).resolves.not.toThrow();
  });

  it('logs the error when DB insertion fails', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error('DB error')),
    });
    const mockLog = { error: vi.fn() };
    const { recordLogin } = await import('../services/login-history.service.js');

    await recordLogin(
      { insert: mockInsert } as never,
      { staffId: null, success: false, ip: null, ua: null },
      mockLog as never
    );

    expect(mockLog.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.any(String)
    );
  });
});
