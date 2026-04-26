import { beforeEach, describe, expect, it, vi } from 'vitest';
// Worker factory tests for notif-slack, notif-email-immediate, notif-email-digest
// Exercises job processor logic without a live Redis connection.
// Strategy: mock BullMQ Worker constructor + capture the processor fn.

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('bullmq', () => {
  const Worker = vi.fn().mockImplementation((_queue, processor, _opts) => {
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    return {
      processor,
      on: (event: string, cb: (...args: unknown[]) => void) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(cb);
      },
      emit: (event: string, ...args: unknown[]) => {
        for (const cb of listeners[event] ?? []) cb(...args);
      },
    };
  });
  return { Worker };
});

vi.mock('../services/notif-slack-client.service.js', () => ({
  postSlackMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/notif-templates.service.js', () => ({
  buildSlackPayload: vi.fn().mockReturnValue({ text: 'Alert!', blocks: [] }),
}));

vi.mock('../services/notif-email-transport.service.js', () => ({
  isDryRun: vi.fn().mockReturnValue(false),
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/notif-digest-aggregator.service.js', () => ({
  fetchDigestGroups: vi.fn().mockResolvedValue([]),
  markDigestSent: vi.fn().mockResolvedValue(undefined),
  renderDigestHtml: vi.fn().mockReturnValue('<html>digest</html>'),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const REDIS_OPTS = { host: 'localhost', port: 6379 };
const STAFF_ID = '00000000-0000-0000-0000-000000000001';

function makeJob<T>(data: T) {
  return { id: 'job-001', data } as { id: string; data: T };
}

function makeDb(overrides: Record<string, unknown> = {}) {
  return {
    query: {
      staffMembers: {
        findFirst: vi.fn().mockResolvedValue({ email: 'ops@example.com', name: 'Ops Team' }),
      },
    },
    ...overrides,
  };
}

// ── Tests: createSlackWorker ──────────────────────────────────────────────────

describe('createSlackWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a BullMQ worker on the slack queue', async () => {
    const { Worker } = await import('bullmq');
    const { createSlackWorker } = await import('../workers/notif-slack.worker.js');
    const worker = createSlackWorker('https://hooks.slack.com/xxx', REDIS_OPTS);
    expect(Worker).toHaveBeenCalledWith(
      expect.stringContaining('notif_slack'),
      expect.any(Function),
      expect.objectContaining({ concurrency: 5 })
    );
    expect(worker).toBeDefined();
  });

  it('processor calls buildSlackPayload and postSlackMessage', async () => {
    const { postSlackMessage } = await import('../services/notif-slack-client.service.js');
    const { buildSlackPayload } = await import('../services/notif-templates.service.js');
    const { createSlackWorker } = await import('../workers/notif-slack.worker.js');

    const worker = createSlackWorker('https://hooks.slack.com/xxx', REDIS_OPTS) as ReturnType<
      typeof createSlackWorker
    > & { processor: (job: unknown) => Promise<void> };
    const job = makeJob({ title: 'Alert', eventType: 'system.health', severity: 'critical' });

    await worker.processor(job);

    expect(vi.mocked(buildSlackPayload)).toHaveBeenCalledWith(job.data);
    expect(vi.mocked(postSlackMessage)).toHaveBeenCalledWith({
      text: 'Alert!',
      blocks: [],
      webhookUrl: 'https://hooks.slack.com/xxx',
    });
  });

  it('registers a failed event handler that masks webhook URL', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { createSlackWorker } = await import('../workers/notif-slack.worker.js');
    const worker = createSlackWorker('https://hooks.slack.com/secret', REDIS_OPTS) as ReturnType<
      typeof createSlackWorker
    > & { emit: (event: string, ...args: unknown[]) => void };

    worker.emit(
      'failed',
      { id: 'job-001' },
      new Error('connect https://hooks.slack.com/secret failed')
    );

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.any(String),
      'job-001',
      expect.stringContaining('<webhook>')
    );
    expect(consoleSpy.mock.calls[0]![2]).not.toContain('secret');
    consoleSpy.mockRestore();
  });
});

// ── Tests: createEmailImmediateWorker ─────────────────────────────────────────

describe('createEmailImmediateWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a BullMQ worker on the email-immediate queue', async () => {
    const { Worker } = await import('bullmq');
    const { createEmailImmediateWorker } = await import(
      '../workers/notif-email-immediate.worker.js'
    );
    createEmailImmediateWorker(
      makeDb() as never,
      { host: 'smtp.example.com', port: 587, user: '', pass: '', from: 'x@y.com' },
      REDIS_OPTS
    );
    expect(Worker).toHaveBeenCalledWith(
      expect.stringContaining('email_immediate'),
      expect.any(Function),
      expect.objectContaining({ concurrency: 5 })
    );
  });

  it('sends email to resolved staff member', async () => {
    const { sendEmail } = await import('../services/notif-email-transport.service.js');
    const { isDryRun } = await import('../services/notif-email-transport.service.js');
    vi.mocked(isDryRun).mockReturnValue(false);

    const { createEmailImmediateWorker } = await import(
      '../workers/notif-email-immediate.worker.js'
    );
    const worker = createEmailImmediateWorker(
      makeDb() as never,
      { host: 'smtp.example.com', port: 587, user: '', pass: '', from: 'noreply@example.com' },
      REDIS_OPTS
    ) as unknown as { processor: (job: unknown) => Promise<void> };

    const jobData = {
      staffId: STAFF_ID,
      notificationId: 'notif-001',
      title: 'Critical Alert',
      body: 'Something broke',
      eventType: 'system.health',
      severity: 'critical',
      payload: null,
    };
    await worker.processor(makeJob(jobData));

    expect(vi.mocked(sendEmail)).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ops@example.com',
        subject: expect.stringContaining('[CRITICAL]'),
      })
    );
  });

  it('skips email send in dry-run mode', async () => {
    const { sendEmail, isDryRun } = await import('../services/notif-email-transport.service.js');
    vi.mocked(isDryRun).mockReturnValue(true);

    const { createEmailImmediateWorker } = await import(
      '../workers/notif-email-immediate.worker.js'
    );
    const worker = createEmailImmediateWorker(
      makeDb() as never,
      { host: 'smtp.example.com', port: 587, user: '', pass: '', from: 'x@y.com' },
      REDIS_OPTS
    ) as unknown as { processor: (job: unknown) => Promise<void> };

    await worker.processor(
      makeJob({
        staffId: STAFF_ID,
        notificationId: 'n1',
        title: 'T',
        body: null,
        eventType: 'e',
        severity: 'critical',
        payload: null,
      })
    );

    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });

  it('discards job silently when staff not found', async () => {
    const { sendEmail, isDryRun } = await import('../services/notif-email-transport.service.js');
    vi.mocked(isDryRun).mockReturnValue(false);

    const db = makeDb({
      query: {
        staffMembers: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
    });

    const { createEmailImmediateWorker } = await import(
      '../workers/notif-email-immediate.worker.js'
    );
    const worker = createEmailImmediateWorker(
      db as never,
      { host: 'smtp.example.com', port: 587, user: '', pass: '', from: 'x@y.com' },
      REDIS_OPTS
    ) as unknown as { processor: (job: unknown) => Promise<void> };

    await worker.processor(
      makeJob({
        staffId: STAFF_ID,
        notificationId: 'n1',
        title: 'T',
        body: null,
        eventType: 'e',
        severity: 'critical',
        payload: null,
      })
    );

    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });
});

// ── Tests: createEmailDigestWorker ────────────────────────────────────────────

describe('createEmailDigestWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a BullMQ worker on the digest queue with concurrency=1', async () => {
    const { Worker } = await import('bullmq');
    const { createEmailDigestWorker } = await import('../workers/notif-email-digest.worker.js');
    createEmailDigestWorker(
      makeDb() as never,
      { host: 'smtp.example.com', port: 587, user: '', pass: '', from: 'x@y.com' },
      REDIS_OPTS
    );
    expect(Worker).toHaveBeenCalledWith(
      expect.stringContaining('digest'),
      expect.any(Function),
      expect.objectContaining({ concurrency: 1 })
    );
  });

  it('skips processing when no digest groups', async () => {
    const { fetchDigestGroups, markDigestSent } = await import(
      '../services/notif-digest-aggregator.service.js'
    );
    vi.mocked(fetchDigestGroups).mockResolvedValue([]);

    const { createEmailDigestWorker } = await import('../workers/notif-email-digest.worker.js');
    const worker = createEmailDigestWorker(
      makeDb() as never,
      { host: 'smtp.example.com', port: 587, user: '', pass: '', from: 'x@y.com' },
      REDIS_OPTS
    ) as unknown as { processor: () => Promise<void> };

    await worker.processor();

    expect(vi.mocked(markDigestSent)).not.toHaveBeenCalled();
  });

  it('sends digest email and marks sent for each group', async () => {
    const { fetchDigestGroups, markDigestSent } = await import(
      '../services/notif-digest-aggregator.service.js'
    );
    const { sendEmail, isDryRun } = await import('../services/notif-email-transport.service.js');
    vi.mocked(isDryRun).mockReturnValue(false);

    const mockGroup = {
      staffId: STAFF_ID,
      email: 'ops@example.com',
      name: 'Ops',
      rows: [
        {
          id: 'notif-1',
          title: 'Alert',
          eventType: 'system.health',
          severity: 'info',
          body: null,
          payload: null,
          createdAt: new Date(),
        },
      ],
    };
    vi.mocked(fetchDigestGroups).mockResolvedValue([mockGroup] as never);

    const { createEmailDigestWorker } = await import('../workers/notif-email-digest.worker.js');
    const worker = createEmailDigestWorker(
      makeDb() as never,
      { host: 'smtp.example.com', port: 587, user: '', pass: '', from: 'noreply@example.com' },
      REDIS_OPTS
    ) as unknown as { processor: () => Promise<void> };

    await worker.processor();

    expect(vi.mocked(sendEmail)).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'ops@example.com' })
    );
    expect(vi.mocked(markDigestSent)).toHaveBeenCalledWith(expect.anything(), ['notif-1']);
  });

  it('marks digest sent in dry-run mode without sending email', async () => {
    const { fetchDigestGroups, markDigestSent } = await import(
      '../services/notif-digest-aggregator.service.js'
    );
    const { sendEmail, isDryRun } = await import('../services/notif-email-transport.service.js');
    vi.mocked(isDryRun).mockReturnValue(true);

    const mockGroup = {
      staffId: STAFF_ID,
      email: 'ops@example.com',
      name: 'Ops',
      rows: [
        {
          id: 'notif-1',
          title: 'Alert',
          eventType: 'system.health',
          severity: 'info',
          body: null,
          payload: null,
          createdAt: new Date(),
        },
      ],
    };
    vi.mocked(fetchDigestGroups).mockResolvedValue([mockGroup] as never);

    const { createEmailDigestWorker } = await import('../workers/notif-email-digest.worker.js');
    const worker = createEmailDigestWorker(
      makeDb() as never,
      { host: 'smtp.example.com', port: 587, user: '', pass: '', from: 'x@y.com' },
      REDIS_OPTS
    ) as unknown as { processor: () => Promise<void> };

    await worker.processor();

    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
    expect(vi.mocked(markDigestSent)).toHaveBeenCalledWith(expect.anything(), ['notif-1']);
  });

  it('continues processing remaining groups on per-staff send failure', async () => {
    const { fetchDigestGroups, markDigestSent } = await import(
      '../services/notif-digest-aggregator.service.js'
    );
    const { sendEmail, isDryRun } = await import('../services/notif-email-transport.service.js');
    vi.mocked(isDryRun).mockReturnValue(false);
    vi.mocked(sendEmail)
      .mockRejectedValueOnce(new Error('SMTP error'))
      .mockResolvedValue(undefined);

    const groups = [
      {
        staffId: 'staff-1',
        email: 'a@example.com',
        name: 'A',
        rows: [
          {
            id: 'n1',
            title: 'T',
            eventType: 'e',
            severity: 'info',
            body: null,
            payload: null,
            createdAt: new Date(),
          },
        ],
      },
      {
        staffId: 'staff-2',
        email: 'b@example.com',
        name: 'B',
        rows: [
          {
            id: 'n2',
            title: 'T',
            eventType: 'e',
            severity: 'info',
            body: null,
            payload: null,
            createdAt: new Date(),
          },
        ],
      },
    ];
    vi.mocked(fetchDigestGroups).mockResolvedValue(groups as never);

    const { createEmailDigestWorker } = await import('../workers/notif-email-digest.worker.js');
    const worker = createEmailDigestWorker(
      makeDb() as never,
      { host: 'smtp.example.com', port: 587, user: '', pass: '', from: 'x@y.com' },
      REDIS_OPTS
    ) as unknown as { processor: () => Promise<void> };

    // Should not throw — continues despite first group failure
    await expect(worker.processor()).resolves.not.toThrow();
    // Second group should still be attempted
    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(2);
  });
});

// ── Tests: createPgBackupWorker ───────────────────────────────────────────────

describe('createPgBackupWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // biome-ignore lint/performance/noDelete: need to unset env for dry-run
    delete process.env.BACKUP_S3_BUCKET;
  });

  it('creates a BullMQ worker on pg_backup queue with concurrency=1', async () => {
    const { Worker } = await import('bullmq');
    const { createPgBackupWorker } = await import('../workers/pg-backup.worker.js');

    const mockUpdate = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    });
    createPgBackupWorker({ update: mockUpdate } as never, REDIS_OPTS);

    expect(Worker).toHaveBeenCalledWith(
      'pg_backup',
      expect.any(Function),
      expect.objectContaining({ concurrency: 1 })
    );
  });

  it('runs in dry-run mode when BACKUP_S3_BUCKET not set', async () => {
    const { createPgBackupWorker } = await import('../workers/pg-backup.worker.js');

    let setArgs: Record<string, unknown> = {};
    const mockUpdate = vi.fn().mockReturnValue({
      set: vi.fn().mockImplementation((args) => {
        setArgs = args;
        return { where: vi.fn().mockResolvedValue(undefined) };
      }),
    });

    const worker = createPgBackupWorker({ update: mockUpdate } as never, REDIS_OPTS) as unknown as {
      processor: (job: unknown) => Promise<void>;
    };
    const job = makeJob({ backupId: 'backup-001', triggeredBy: STAFF_ID });

    await worker.processor(job);

    // Should mark as running then done
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(setArgs).toMatchObject({ status: 'done' });
    // s3Key should be dry-run prefixed
    expect(String(setArgs.s3Key)).toContain('[dry-run]');
  });

  it('marks backup as failed on error and rethrows', async () => {
    process.env.BACKUP_S3_BUCKET = 'my-bucket';

    const { createPgBackupWorker } = await import('../workers/pg-backup.worker.js');

    // Mock execFile to throw
    vi.mock('node:child_process', () => ({
      execFile: vi.fn((_cmd, _args, cb: (err: Error | null) => void) =>
        cb(new Error('pg_dump not found'))
      ),
    }));

    const statusValues: string[] = [];
    const mockUpdate = vi.fn().mockReturnValue({
      set: vi.fn().mockImplementation((args) => {
        statusValues.push(args.status as string);
        return { where: vi.fn().mockResolvedValue(undefined) };
      }),
    });

    const worker = createPgBackupWorker({ update: mockUpdate } as never, REDIS_OPTS) as unknown as {
      processor: (job: unknown) => Promise<void>;
    };
    const job = makeJob({ backupId: 'backup-001', triggeredBy: STAFF_ID });

    await expect(worker.processor(job)).rejects.toThrow();
    expect(statusValues).toContain('failed');

    // biome-ignore lint/performance/noDelete: clean up env after test
    delete process.env.BACKUP_S3_BUCKET;
  });
});
