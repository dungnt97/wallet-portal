// notif-templates.service — builds Slack Block Kit message payloads for notification events.
// All payload values are escaped before embedding in block text to prevent injection.
import type { SlackBlock } from './notif-slack-client.service.js';
import type { SlackJobData } from './notify-staff.service.js';

// ── Severity → emoji + colour label ──────────────────────────────────────────

const SEVERITY_LABEL: Record<string, string> = {
  critical: ':rotating_light: CRITICAL',
  warning: ':warning: WARNING',
  info: ':information_source: INFO',
};

/** Truncate a string to max length with ellipsis */
function trunc(s: string, max = 200): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** Escape Slack mrkdwn special characters */
function escMrkdwn(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Block builder ─────────────────────────────────────────────────────────────

/**
 * Build a Slack Block Kit payload for a critical notification job.
 * Returns { text, blocks } ready to pass to postSlackMessage().
 */
export function buildSlackPayload(job: SlackJobData): { text: string; blocks: SlackBlock[] } {
  const label = SEVERITY_LABEL[job.severity] ?? job.severity.toUpperCase();
  const text = `${label}: ${job.title}`;

  const payloadExcerpt = job.payload ? trunc(JSON.stringify(job.payload)) : null;

  const bodyLine = job.body ? `\n${escMrkdwn(trunc(job.body))}` : '';

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: trunc(`${label}: ${job.title}`, 150) },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: [
          `*Event type:* \`${escMrkdwn(job.eventType)}\``,
          `*Severity:* ${escMrkdwn(job.severity)}`,
          bodyLine,
          payloadExcerpt ? `\`\`\`${escMrkdwn(payloadExcerpt)}\`\`\`` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      },
    },
    { type: 'divider' },
  ];

  return { text, blocks };
}
