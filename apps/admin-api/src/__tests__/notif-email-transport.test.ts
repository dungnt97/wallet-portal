// Unit tests for notif-email-transport service — dry-run, live send, transport error.
// Uses in-memory mocks — no real SMTP server required.
//
// NOTE: vi.mock is hoisted to top of file by Vitest. The factory must NOT
// reference variables declared outside it (temporal dead zone). Instead,
// we inline vi.fn() inside the factory and access the mock via the imported module.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('nodemailer', () => {
  const sendMail = vi.fn();
  const createTransport = vi.fn().mockReturnValue({ sendMail });
  return { default: { createTransport } };
});

import nodemailer from 'nodemailer';
import {
  isDryRun,
  resetEmailTransport,
  sendEmail,
} from '../services/notif-email-transport.service.js';

// Helper: get the sendMail fn from the mocked transport instance
function getSendMail(): ReturnType<typeof vi.fn> {
  // After createTransport is called, its return value holds sendMail
  const transport = vi.mocked(nodemailer.createTransport).mock.results[0]?.value as
    | { sendMail: ReturnType<typeof vi.fn> }
    | undefined;
  return transport?.sendMail ?? vi.fn();
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SMTP_CFG = {
  host: 'smtp.test.example.com',
  port: 587,
  user: 'user@test.example.com',
  pass: 'secret',
  from: 'noreply@test.example.com',
};

const SEND_OPTS = {
  to: 'recipient@example.com',
  subject: 'Test Subject',
  html: '<p>Hello</p>',
  cfg: SMTP_CFG,
};

// ── Tests — dry-run mode ──────────────────────────────────────────────────────

describe('sendEmail — dry-run mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEmailTransport();
    process.env.NOTIFICATIONS_DRY_RUN = 'true';
  });

  afterEach(() => {
    resetEmailTransport();
  });

  it('does not call createTransport in dry-run mode', async () => {
    await sendEmail(SEND_OPTS);
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it('resolves without error in dry-run mode', async () => {
    await expect(sendEmail(SEND_OPTS)).resolves.toBeUndefined();
  });
});

// ── Tests — live mode ─────────────────────────────────────────────────────────

describe('sendEmail — live mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEmailTransport();
    process.env.NOTIFICATIONS_DRY_RUN = 'false';
    // Pre-configure sendMail success so transport is built on first sendEmail call
    vi.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail: vi.fn().mockResolvedValue({ messageId: 'msg-001' }),
    } as never);
  });

  afterEach(() => {
    resetEmailTransport();
    process.env.NOTIFICATIONS_DRY_RUN = 'true';
  });

  it('calls sendMail with correct options', async () => {
    await sendEmail(SEND_OPTS);
    const sendMail = getSendMail();

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: SEND_OPTS.to,
        subject: SEND_OPTS.subject,
        html: SEND_OPTS.html,
        from: SMTP_CFG.from,
      })
    );
  });

  it('throws when transport.sendMail rejects', async () => {
    vi.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail: vi.fn().mockRejectedValue(new Error('SMTP connection refused')),
    } as never);

    await expect(sendEmail(SEND_OPTS)).rejects.toThrow('SMTP connection refused');
  });

  it('reuses the same transport singleton on repeated calls', async () => {
    await sendEmail(SEND_OPTS);
    await sendEmail(SEND_OPTS);
    // createTransport called once — transport is cached between calls
    expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
  });
});

// ── Tests — isDryRun helper ───────────────────────────────────────────────────

describe('isDryRun helper', () => {
  afterEach(() => {
    process.env.NOTIFICATIONS_DRY_RUN = 'true';
  });

  it('returns true when env is not explicitly "false"', () => {
    process.env.NOTIFICATIONS_DRY_RUN = 'true';
    expect(isDryRun()).toBe(true);
  });

  it('returns false when env is exactly "false"', () => {
    process.env.NOTIFICATIONS_DRY_RUN = 'false';
    expect(isDryRun()).toBe(false);
  });
});

// ── Tests — resetEmailTransport ───────────────────────────────────────────────

describe('resetEmailTransport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NOTIFICATIONS_DRY_RUN = 'false';
    vi.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail: vi.fn().mockResolvedValue({}),
    } as never);
  });

  afterEach(() => {
    resetEmailTransport();
    process.env.NOTIFICATIONS_DRY_RUN = 'true';
  });

  it('clears singleton so next sendEmail rebuilds transport', async () => {
    await sendEmail(SEND_OPTS);
    resetEmailTransport();
    await sendEmail(SEND_OPTS);
    // createTransport called twice — once before reset, once after
    expect(nodemailer.createTransport).toHaveBeenCalledTimes(2);
  });
});
