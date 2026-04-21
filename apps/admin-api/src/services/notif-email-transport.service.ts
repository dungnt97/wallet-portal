// notif-email-transport.service — nodemailer SMTP transport factory.
// In dry-run mode (NOTIFICATIONS_DRY_RUN=true), logs payloads instead of sending.
import nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer/index.js';

// ── Transport singleton ───────────────────────────────────────────────────────

let _transport: nodemailer.Transporter | null = null;

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

function getTransport(cfg: SmtpConfig): nodemailer.Transporter {
  if (_transport) return _transport;
  _transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
  });
  return _transport;
}

/** Reset cached transport — call when SMTP config changes or in tests */
export function resetEmailTransport(): void {
  _transport = null;
}

// ── Dry-run guard ─────────────────────────────────────────────────────────────

export function isDryRun(): boolean {
  return process.env.NOTIFICATIONS_DRY_RUN !== 'false';
}

// ── Send helper ───────────────────────────────────────────────────────────────

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  cfg: SmtpConfig;
}

/**
 * Send an email via SMTP or log in dry-run mode.
 * Throws on transport error — caller should catch + retry via BullMQ backoff.
 */
export async function sendEmail(opts: SendEmailOptions): Promise<void> {
  const { to, subject, html, cfg } = opts;

  if (isDryRun()) {
    console.info('[notif-email] DRY_RUN subject=%s to=%s', subject, to, { dryRun: true, html });
    return;
  }

  const mailOptions: Mail.Options = {
    from: cfg.from,
    to,
    subject,
    html,
  };

  const transport = getTransport(cfg);
  await transport.sendMail(mailOptions);
}
