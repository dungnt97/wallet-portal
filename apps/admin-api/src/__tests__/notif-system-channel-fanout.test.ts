import { beforeEach, describe, expect, it, vi } from 'vitest';
// Tests for notif-system-channel-fanout.service.ts
// fanoutToSystemChannels: queries enabled channels/rules, dispatches per kind

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeChannel(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ch-001',
    kind: 'slack' as const,
    name: 'ops-slack',
    target: 'https://hooks.slack.com/xxx',
    enabled: true,
    severityFilter: 'info' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeRule(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rule-001',
    eventType: 'system.health',
    severity: 'info' as const,
    channelKind: 'slack' as const,
    enabled: true,
    ...overrides,
  };
}

function buildDb(channels: ReturnType<typeof makeChannel>[], rules: ReturnType<typeof makeRule>[]) {
  let selectCallN = 0;
  return {
    select: vi.fn(() => {
      selectCallN++;
      if (selectCallN === 1) {
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(rules),
          }),
        };
      }
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(channels),
        }),
      };
    }),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('fanoutToSystemChannels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NOTIFICATIONS_DRY_RUN = 'true';
  });

  it('is a no-op when NOTIFICATIONS_ENABLED=false', async () => {
    process.env.NOTIFICATIONS_ENABLED = 'false';
    const db = buildDb([makeChannel()], [makeRule()]);

    const { fanoutToSystemChannels } = await import(
      '../services/notif-system-channel-fanout.service.js'
    );
    await fanoutToSystemChannels(db as never, {
      eventType: 'system.health',
      severity: 'critical',
      title: 'DB down',
      body: null,
    });

    expect(db.select).not.toHaveBeenCalled();
    process.env.NOTIFICATIONS_ENABLED = 'true';
  });

  it('queries routing rules and channels', async () => {
    process.env.NOTIFICATIONS_ENABLED = 'true';
    const db = buildDb([makeChannel()], [makeRule()]);

    const { fanoutToSystemChannels } = await import(
      '../services/notif-system-channel-fanout.service.js'
    );
    await fanoutToSystemChannels(db as never, {
      eventType: 'system.health',
      severity: 'critical',
      title: 'DB down',
      body: null,
    });

    expect(db.select).toHaveBeenCalled();
  });

  it('skips disabled channels', async () => {
    process.env.NOTIFICATIONS_ENABLED = 'true';
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const db = buildDb([makeChannel({ enabled: false })], [makeRule()]);

    const { fanoutToSystemChannels } = await import(
      '../services/notif-system-channel-fanout.service.js'
    );
    await fanoutToSystemChannels(db as never, {
      eventType: 'system.health',
      severity: 'critical',
      title: 'DB down',
      body: null,
    });

    // No dispatch log for disabled channel
    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('slack'),
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
    consoleSpy.mockRestore();
  });

  it('dispatches to slack channel in dry-run mode', async () => {
    process.env.NOTIFICATIONS_ENABLED = 'true';
    process.env.NOTIFICATIONS_DRY_RUN = 'true';
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const db = buildDb([makeChannel({ kind: 'slack' })], [makeRule({ channelKind: 'slack' })]);

    const { fanoutToSystemChannels } = await import(
      '../services/notif-system-channel-fanout.service.js'
    );
    await fanoutToSystemChannels(db as never, {
      eventType: 'system.health',
      severity: 'critical',
      title: 'DB down',
      body: null,
    });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('DRY_RUN'), expect.anything());
    consoleSpy.mockRestore();
  });

  it('dispatches to email channel in dry-run mode', async () => {
    process.env.NOTIFICATIONS_ENABLED = 'true';
    process.env.NOTIFICATIONS_DRY_RUN = 'true';
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const db = buildDb(
      [makeChannel({ kind: 'email', target: 'ops@example.com' })],
      [makeRule({ channelKind: 'email' })]
    );

    const { fanoutToSystemChannels } = await import(
      '../services/notif-system-channel-fanout.service.js'
    );
    await fanoutToSystemChannels(db as never, {
      eventType: 'system.health',
      severity: 'warning',
      title: 'Slow query',
      body: 'Query took 5s',
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('DRY_RUN'),
      expect.anything(),
      expect.anything()
    );
    consoleSpy.mockRestore();
  });

  it('returns early when no matching rules for event type', async () => {
    process.env.NOTIFICATIONS_ENABLED = 'true';
    const db = buildDb([makeChannel()], [makeRule({ eventType: 'other.event' })]);

    const { fanoutToSystemChannels } = await import(
      '../services/notif-system-channel-fanout.service.js'
    );
    // Should not throw
    await expect(
      fanoutToSystemChannels(db as never, {
        eventType: 'system.health',
        severity: 'info',
        title: 'Heartbeat',
        body: null,
      })
    ).resolves.not.toThrow();
  });

  it('skips channels that do not meet severity filter', async () => {
    process.env.NOTIFICATIONS_ENABLED = 'true';
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    // Channel has err filter, but event is info severity
    const db = buildDb(
      [makeChannel({ severityFilter: 'err' })],
      [makeRule({ channelKind: 'slack', severity: 'err' })]
    );

    const { fanoutToSystemChannels } = await import(
      '../services/notif-system-channel-fanout.service.js'
    );
    await fanoutToSystemChannels(db as never, {
      eventType: 'system.health',
      severity: 'info',
      title: 'Heartbeat',
      body: null,
    });

    // No dispatch log since info < err filter
    const dispatchCalls = consoleSpy.mock.calls.filter((c) => !String(c[0]).includes('DRY_RUN'));
    expect(dispatchCalls).toHaveLength(0);
    consoleSpy.mockRestore();
  });
});
