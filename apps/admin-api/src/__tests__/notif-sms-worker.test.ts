import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Tests for workers/notif-sms.worker.ts — createSmsWorker
// Covers: phone resolution, dry-run path, production creds-missing path,
//         successful Twilio send path, worker.on('failed') handler

// ── Mock BullMQ Worker ────────────────────────────────────────────────────────

vi.mock('bullmq', () => {
  const Worker = vi.fn().mockImplementation((_queue: string, processor: unknown) => {
    const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
    return {
      _processor: processor,
      on(event: string, cb: (...args: unknown[]) => void) {
        listeners[event] = [...(listeners[event] ?? []), cb];
      },
      _emit(event: string, ...args: unknown[]) {
        for (const cb of listeners[event] ?? []) cb(...args);
      },
    };
  });
  return { Worker };
});

// ── Mock metrics counter ──────────────────────────────────────────────────────

const mockCounterInc = vi.fn();
vi.mock('../telemetry/metrics.js', () => ({
  notifSmsDroppedTotal: { inc: (...args: unknown[]) => mockCounterInc(...args) },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

type WorkerHandle = {
  _processor: (job: { id: string; data: Record<string, unknown> }) => Promise<void>;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  _emit: (event: string, ...args: unknown[]) => void;
};

function makeDb(phoneNumber: string | null | undefined) {
  return {
    query: {
      staffMembers: {
        findFirst: vi
          .fn()
          .mockResolvedValue(
            phoneNumber !== undefined ? { phoneNumber, name: 'Test Staff' } : undefined
          ),
      },
    },
  };
}

const SMS_JOB = {
  id: 'sms-job-001',
  data: {
    notificationId: 'notif-001',
    staffId: 'staff-001',
    title: 'Critical Alert',
    body: 'System is down',
    severity: 'critical',
  },
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createSmsWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('discards job silently when staff has no phone number', async () => {
    const db = makeDb(null);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { createSmsWorker } = await import('../workers/notif-sms.worker.js');

    const worker = createSmsWorker(db as never, {} as never) as unknown as WorkerHandle;
    await worker._processor(SMS_JOB);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[notif-sms]'), 'staff-001');
    warnSpy.mockRestore();
  });

  it('discards job silently when staff record not found', async () => {
    const db = makeDb(undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { createSmsWorker } = await import('../workers/notif-sms.worker.js');

    const worker = createSmsWorker(db as never, {} as never) as unknown as WorkerHandle;
    await worker._processor(SMS_JOB);

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('dry-run path: logs to console.info when no Twilio creds in non-production', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    // biome-ignore lint/performance/noDelete: test env cleanup
    delete process.env.TWILIO_ACCOUNT_SID;
    // biome-ignore lint/performance/noDelete: test env cleanup
    delete process.env.TWILIO_AUTH_TOKEN;
    // biome-ignore lint/performance/noDelete: test env cleanup
    delete process.env.TWILIO_FROM_NUMBER;

    const db = makeDb('+14155550001');
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { createSmsWorker } = await import('../workers/notif-sms.worker.js');

    const worker = createSmsWorker(db as never, {} as never) as unknown as WorkerHandle;
    await worker._processor(SMS_JOB);

    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining('DRY_RUN'),
      expect.any(String),
      expect.any(String)
    );
    infoSpy.mockRestore();
  });

  it('production creds-missing: logs error and increments Prometheus counter', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    // biome-ignore lint/performance/noDelete: test env cleanup
    delete process.env.TWILIO_ACCOUNT_SID;
    // biome-ignore lint/performance/noDelete: test env cleanup
    delete process.env.TWILIO_AUTH_TOKEN;
    // biome-ignore lint/performance/noDelete: test env cleanup
    delete process.env.TWILIO_FROM_NUMBER;

    const db = makeDb('+14155550002');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { createSmsWorker } = await import('../workers/notif-sms.worker.js');

    const worker = createSmsWorker(db as never, {} as never) as unknown as WorkerHandle;
    await worker._processor(SMS_JOB);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[notif-sms]'),
      expect.any(String),
      expect.any(String)
    );
    expect(mockCounterInc).toHaveBeenCalledWith({ reason: 'creds_missing' });
    errorSpy.mockRestore();
  });

  it('sends Twilio SMS when creds are set and phone is present', async () => {
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'ACtest123');
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'authtoken123');
    vi.stubEnv('TWILIO_FROM_NUMBER', '+15005550006');
    vi.stubEnv('NODE_ENV', 'test');

    const db = makeDb('+14155550003');
    // Mock fetch to simulate successful Twilio response
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;

    const { createSmsWorker } = await import('../workers/notif-sms.worker.js');
    const worker = createSmsWorker(db as never, {} as never) as unknown as WorkerHandle;
    await worker._processor(SMS_JOB);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('api.twilio.com'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('throws when Twilio returns non-2xx response', async () => {
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'ACtest123');
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'authtoken123');
    vi.stubEnv('TWILIO_FROM_NUMBER', '+15005550006');
    vi.stubEnv('NODE_ENV', 'test');

    const db = makeDb('+14155550004');
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: vi.fn().mockResolvedValue('invalid number'),
    }) as unknown as typeof fetch;

    const { createSmsWorker } = await import('../workers/notif-sms.worker.js');
    const worker = createSmsWorker(db as never, {} as never) as unknown as WorkerHandle;

    await expect(worker._processor(SMS_JOB)).rejects.toThrow('Twilio SMS failed');
  });

  it('worker.on(failed) logs job failure with masked phone number', async () => {
    const db = makeDb('+14155550005');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { createSmsWorker } = await import('../workers/notif-sms.worker.js');

    const worker = createSmsWorker(db as never, {} as never) as unknown as WorkerHandle;
    worker._emit('failed', { id: 'fail-job-001' }, new Error('network timeout +14155550005'));

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[notif-sms]'),
      'fail-job-001',
      expect.stringContaining('<phone>')
    );
    errorSpy.mockRestore();
  });
});
