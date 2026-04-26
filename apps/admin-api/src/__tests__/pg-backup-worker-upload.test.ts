import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Supplemental pg-backup.worker tests covering:
//   - uploadToS3 (lines 38-62): S3 upload path when BACKUP_S3_BUCKET is set
//   - real pg_dump execution path (lines 107-129)
//   - worker.on('failed') event handler (line 158)

// ── Mock BullMQ worker ────────────────────────────────────────────────────────

vi.mock('bullmq', () => {
  const Worker = vi
    .fn()
    .mockImplementation((_queue: string, processor: unknown, _opts: unknown) => {
      const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
      return {
        processor,
        on: (event: string, cb: (...args: unknown[]) => void) => {
          listeners[event] = [...(listeners[event] ?? []), cb];
        },
        emit: (event: string, ...args: unknown[]) => {
          for (const cb of listeners[event] ?? []) cb(...args);
        },
      };
    });
  return { Worker };
});

// ── Mock child_process.execFile ───────────────────────────────────────────────

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, execFile: vi.fn() };
});

// ── Mock @aws-sdk/client-s3 for uploadToS3 ────────────────────────────────────

const mockS3Send = vi.fn().mockResolvedValue({});
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({ send: mockS3Send })),
  PutObjectCommand: vi.fn().mockImplementation((params: unknown) => ({ params })),
}));

// ── Mock node:fs for statSync and createReadStream ────────────────────────────

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    statSync: vi.fn().mockReturnValue({ size: 12345 }),
    createReadStream: vi.fn().mockReturnValue({ pipe: vi.fn() }),
    unlinkSync: vi.fn(),
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDb() {
  let updateCallN = 0;
  return {
    update: vi.fn().mockImplementation(() => {
      updateCallN++;
      return {
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: `backup-${updateCallN}` }]),
        }),
      };
    }),
  };
}

// ── Tests: real dump path (BACKUP_S3_BUCKET set) ─────────────────────────────

describe('createPgBackupWorker — real dump path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BACKUP_S3_BUCKET = 'my-backup-bucket';
    process.env.DATABASE_URL = 'postgresql://localhost/testdb';
  });

  afterEach(() => {
    // biome-ignore lint/performance/noDelete: test env cleanup
    delete process.env.BACKUP_S3_BUCKET;
    // biome-ignore lint/performance/noDelete: test env cleanup
    delete process.env.DATABASE_URL;
  });

  it('executes pg_dump, uploads to S3, marks backup as done', async () => {
    // Make execFile call the callback immediately (success)
    const { execFile } = await import('node:child_process');
    vi.mocked(execFile).mockImplementation(((
      _cmd: string,
      _args: string[],
      cb: (err: Error | null) => void
    ) => {
      cb(null);
      return undefined as never;
    }) as never);

    const db = makeDb();
    const { createPgBackupWorker } = await import('../workers/pg-backup.worker.js');
    const worker = createPgBackupWorker(db as never, {} as never);

    // Execute the processor
    await (worker as unknown as { processor: (job: unknown) => Promise<void> }).processor({
      data: { backupId: 'backup-001' },
    });

    // Should have called update twice: mark running, then mark done
    expect(db.update).toHaveBeenCalledTimes(2);
    // S3 upload was called
    expect(mockS3Send).toHaveBeenCalledTimes(1);
  });

  it('marks backup as failed and rethrows when pg_dump fails', async () => {
    const { execFile } = await import('node:child_process');
    vi.mocked(execFile).mockImplementation(((
      _cmd: string,
      _args: string[],
      cb: (err: Error | null) => void
    ) => {
      cb(new Error('pg_dump: connection refused'));
      return undefined as never;
    }) as never);

    const db = makeDb();
    const { createPgBackupWorker } = await import('../workers/pg-backup.worker.js');
    const worker = createPgBackupWorker(db as never, {} as never);

    await expect(
      (worker as unknown as { processor: (job: unknown) => Promise<void> }).processor({
        data: { backupId: 'backup-002' },
      })
    ).rejects.toThrow();

    // Should have called update to mark failed
    // The db.update call count includes: mark running, mark failed
    expect(db.update).toHaveBeenCalledTimes(2);
  });

  it('worker.on(failed) logs job failure', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = makeDb();
    const { createPgBackupWorker } = await import('../workers/pg-backup.worker.js');
    const worker = createPgBackupWorker(db as never, {} as never) as unknown as {
      emit: (event: string, ...args: unknown[]) => void;
    };

    worker.emit('failed', { id: 'job-001' }, new Error('S3 upload failed'));
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[pg-backup]'),
      'job-001',
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });
});
