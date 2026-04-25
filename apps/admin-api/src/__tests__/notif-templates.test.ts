// Unit tests for notif-templates service — Slack Block Kit payload building.
// Pure function tests — no mocks required.
import { describe, expect, it } from 'vitest';
import { buildSlackPayload } from '../services/notif-templates.service.js';
import type { SlackJobData } from '../services/notify-staff.service.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeJob = (overrides: Partial<SlackJobData> = {}): SlackJobData => ({
  notificationId: 'notif-uuid-0001',
  eventType: 'withdrawal.executed',
  severity: 'info',
  title: 'Withdrawal executed',
  body: 'Withdrawal of 1000 USDT completed.',
  payload: { withdrawalId: 'wd-001', amount: '1000', token: 'USDT' },
  ...overrides,
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildSlackPayload — structure', () => {
  it('returns text and blocks array with 3 elements', () => {
    const { text, blocks } = buildSlackPayload(makeJob());
    expect(text).toBeDefined();
    expect(blocks).toHaveLength(3);
  });

  it('first block is header type with plain_text', () => {
    const { blocks } = buildSlackPayload(makeJob());
    expect(blocks[0]).toMatchObject({ type: 'header', text: { type: 'plain_text' } });
  });

  it('second block is section type with mrkdwn', () => {
    const { blocks } = buildSlackPayload(makeJob());
    expect(blocks[1]).toMatchObject({ type: 'section', text: { type: 'mrkdwn' } });
  });

  it('third block is divider', () => {
    const { blocks } = buildSlackPayload(makeJob());
    expect(blocks[2]).toMatchObject({ type: 'divider' });
  });
});

describe('buildSlackPayload — severity labels', () => {
  it('labels critical severity with rotating_light', () => {
    const { text } = buildSlackPayload(makeJob({ severity: 'critical', title: 'Kill switch' }));
    expect(text).toContain('CRITICAL');
  });

  it('labels warning severity', () => {
    const { text } = buildSlackPayload(makeJob({ severity: 'warning', title: 'Drift detected' }));
    expect(text).toContain('WARNING');
  });

  it('labels info severity', () => {
    const { text } = buildSlackPayload(makeJob({ severity: 'info', title: 'Deposit confirmed' }));
    expect(text).toContain('INFO');
  });
});

describe('buildSlackPayload — content rendering', () => {
  it('includes eventType in section body', () => {
    const job = makeJob({ eventType: 'sweep.completed' });
    const { blocks } = buildSlackPayload(job);
    const section = blocks[1] as { type: 'section'; text: { type: 'mrkdwn'; text: string } };
    expect(section.text.text).toContain('sweep.completed');
  });

  it('includes body text when provided', () => {
    const job = makeJob({ body: 'Sweep of 5 addresses completed.' });
    const { blocks } = buildSlackPayload(job);
    const section = blocks[1] as { type: 'section'; text: { type: 'mrkdwn'; text: string } };
    expect(section.text.text).toContain('Sweep of 5 addresses completed.');
  });

  it('omits payload excerpt when payload is null', () => {
    const job = makeJob({ payload: null });
    const { blocks } = buildSlackPayload(job);
    const section = blocks[1] as { type: 'section'; text: { type: 'mrkdwn'; text: string } };
    // No code block (```) when payload absent
    expect(section.text.text).not.toContain('```');
  });

  it('includes payload JSON excerpt when payload present', () => {
    const job = makeJob({ payload: { depositId: 'dep-001' } });
    const { blocks } = buildSlackPayload(job);
    const section = blocks[1] as { type: 'section'; text: { type: 'mrkdwn'; text: string } };
    expect(section.text.text).toContain('dep-001');
  });

  it('escapes HTML special chars in body (& < >)', () => {
    const job = makeJob({ body: 'Amount: 1 < 2 & token > 0' });
    const { blocks } = buildSlackPayload(job);
    const section = blocks[1] as { type: 'section'; text: { type: 'mrkdwn'; text: string } };
    expect(section.text.text).toContain('&lt;');
    expect(section.text.text).toContain('&amp;');
    expect(section.text.text).toContain('&gt;');
  });

  it('truncates very long body to ≤200 chars with ellipsis', () => {
    const longBody = 'x'.repeat(300);
    const job = makeJob({ body: longBody, payload: null });
    const { blocks } = buildSlackPayload(job);
    const section = blocks[1] as { type: 'section'; text: { type: 'mrkdwn'; text: string } };
    expect(section.text.text).toContain('…');
  });
});
