import { describe, expect, it } from 'vitest';
import type {
  NotificationEventPrefs,
  NotificationPayload,
  NotificationPrefs,
  NotificationSeverity,
} from '../notification.js';

describe('Notification types', () => {
  it('NotificationSeverity type is importable', () => {
    // Verify the type is importable and usable
    const severity: NotificationSeverity = 'info';
    expect(severity).toBe('info');

    const warningSeverity: NotificationSeverity = 'warning';
    expect(warningSeverity).toBe('warning');

    const criticalSeverity: NotificationSeverity = 'critical';
    expect(criticalSeverity).toBe('critical');
  });

  it('NotificationEventPrefs structure is correct', () => {
    const prefs: NotificationEventPrefs = {
      withdrawal: true,
      sweep: false,
      deposit: true,
      killSwitch: false,
      reorg: true,
      health: false,
      coldTimelock: true,
    };

    expect(prefs.withdrawal).toBe(true);
    expect(prefs.sweep).toBe(false);
    expect(prefs.coldTimelock).toBe(true);
  });

  it('NotificationPrefs structure is correct', () => {
    const prefs: NotificationPrefs = {
      inApp: true,
      email: false,
      slack: true,
      sms: false,
      eventTypes: {
        withdrawal: true,
        sweep: true,
        deposit: false,
        killSwitch: false,
        reorg: true,
        health: true,
        coldTimelock: false,
      },
    };

    expect(prefs.inApp).toBe(true);
    expect(prefs.email).toBe(false);
    expect(prefs.slack).toBe(true);
    expect(prefs.sms).toBe(false);
    expect(prefs.eventTypes.withdrawal).toBe(true);
  });

  it('NotificationPayload structure is correct', () => {
    const payload: NotificationPayload = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      staffId: '550e8400-e29b-41d4-a716-446655440001',
      eventType: 'withdrawal',
      severity: 'warning',
      title: 'Withdrawal Pending',
      body: 'A withdrawal request is pending approval',
      payload: { withdrawalId: '123', amount: '1000' },
      dedupeKey: 'withdrawal:123',
      readAt: null,
      createdAt: '2026-01-01T00:00:00Z',
    };

    expect(payload.id).toBeDefined();
    expect(payload.severity).toBe('warning');
    expect(payload.title).toBe('Withdrawal Pending');
    expect(payload.readAt).toBeNull();
  });

  it('NotificationPayload with null body and payload', () => {
    const payload: NotificationPayload = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      staffId: '550e8400-e29b-41d4-a716-446655440001',
      eventType: 'health',
      severity: 'info',
      title: 'Health Check',
      body: null,
      payload: null,
      dedupeKey: null,
      readAt: null,
      createdAt: '2026-01-01T00:00:00Z',
    };

    expect(payload.body).toBeNull();
    expect(payload.payload).toBeNull();
    expect(payload.dedupeKey).toBeNull();
  });

  it('NotificationPayload with readAt set', () => {
    const payload: NotificationPayload = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      staffId: '550e8400-e29b-41d4-a716-446655440001',
      eventType: 'sweep',
      severity: 'info',
      title: 'Sweep Complete',
      body: 'Asset sweep completed successfully',
      payload: { addresses: ['0x123', '0x456'] },
      dedupeKey: 'sweep:001',
      readAt: '2026-01-01T01:00:00Z',
      createdAt: '2026-01-01T00:00:00Z',
    };

    expect(payload.readAt).toBe('2026-01-01T01:00:00Z');
  });

  it('All notification event type preferences work', () => {
    const eventTypes: NotificationEventPrefs = {
      withdrawal: true,
      sweep: true,
      deposit: true,
      killSwitch: true,
      reorg: true,
      health: true,
      coldTimelock: true,
    };

    expect(eventTypes.withdrawal).toBe(true);
    expect(eventTypes.sweep).toBe(true);
    expect(eventTypes.deposit).toBe(true);
    expect(eventTypes.killSwitch).toBe(true);
    expect(eventTypes.reorg).toBe(true);
    expect(eventTypes.health).toBe(true);
    expect(eventTypes.coldTimelock).toBe(true);
  });

  it('All notification channel preferences work', () => {
    const prefs: NotificationPrefs = {
      inApp: true,
      email: true,
      slack: true,
      sms: true,
      eventTypes: {
        withdrawal: true,
        sweep: false,
        deposit: true,
        killSwitch: false,
        reorg: true,
        health: false,
        coldTimelock: true,
      },
    };

    expect(prefs.inApp).toBe(true);
    expect(prefs.email).toBe(true);
    expect(prefs.slack).toBe(true);
    expect(prefs.sms).toBe(true);
    expect(Object.keys(prefs.eventTypes).length).toBe(7);
  });
});
