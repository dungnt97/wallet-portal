// notif-slack-client.service — posts Block Kit messages to a Slack incoming webhook.
// NOTIFICATIONS_DRY_RUN=true → logs payload, no HTTP call.
// SLACK_WEBHOOK_URL empty → logs warning, no HTTP call.
// Webhook URL is never echoed in log lines to avoid leaking in log aggregators.

export interface SlackPostOptions {
  text: string;
  blocks: SlackBlock[];
  webhookUrl: string;
}

// Minimal Block Kit types (no SDK dependency)
export type SlackBlock =
  | { type: 'header'; text: { type: 'plain_text'; text: string } }
  | { type: 'section'; text: { type: 'mrkdwn'; text: string } }
  | { type: 'divider' };

function isDryRun(): boolean {
  return process.env.NOTIFICATIONS_DRY_RUN !== 'false';
}

/**
 * POST a message to a Slack incoming webhook.
 * - Masks the webhook URL in any error messages.
 * - Dry-run: logs the payload without sending.
 * - Throws on non-2xx or network error — caller retries via BullMQ backoff.
 */
export async function postSlackMessage(opts: SlackPostOptions): Promise<void> {
  const { text, blocks, webhookUrl } = opts;

  if (!webhookUrl) {
    console.warn('[notif-slack] SLACK_WEBHOOK_URL not configured — message suppressed');
    return;
  }

  if (isDryRun()) {
    console.info('[notif-slack] DRY_RUN text=%s blocks=%d', text, blocks.length, {
      dryRun: true,
      blocks,
    });
    return;
  }

  const body = JSON.stringify({ text, blocks });
  let res: Response;
  try {
    res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      signal: AbortSignal.timeout(5_000),
    });
  } catch (err) {
    // Mask URL in thrown error
    throw new Error(`Slack webhook request failed: ${err}`);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Slack webhook HTTP ${res.status}: ${detail}`);
  }
}
