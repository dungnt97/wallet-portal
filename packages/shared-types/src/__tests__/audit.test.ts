import { describe, expect, it } from 'vitest';
import { AuditEvent, AuditListResponse, AuditLogEntry, AuditVerifyResponse } from '../audit.js';

describe('AuditEvent', () => {
  const validEvent = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    staffId: '550e8400-e29b-41d4-a716-446655440001',
    action: 'create',
    resourceType: 'user',
    resourceId: '550e8400-e29b-41d4-a716-446655440002',
    changes: { field: 'value' },
    ipAddr: '192.168.1.1',
    ua: 'Mozilla/5.0',
    prevHash: '0000000000000000000000000000000000000000000000000000000000000000',
    hash: '1111111111111111111111111111111111111111111111111111111111111111',
    createdAt: '2026-01-01T00:00:00Z',
  };

  it('parses valid audit event', () => {
    const result = AuditEvent.safeParse(validEvent);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.action).toBe('create');
      expect(result.data.resourceType).toBe('user');
    }
  });

  it('accepts null staffId', () => {
    const result = AuditEvent.safeParse({
      ...validEvent,
      staffId: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts null resourceId', () => {
    const result = AuditEvent.safeParse({
      ...validEvent,
      resourceId: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts null changes', () => {
    const result = AuditEvent.safeParse({
      ...validEvent,
      changes: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts null ipAddr', () => {
    const result = AuditEvent.safeParse({
      ...validEvent,
      ipAddr: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts null ua', () => {
    const result = AuditEvent.safeParse({
      ...validEvent,
      ua: null,
    });
    expect(result.success).toBe(true);
  });

  it('accepts null prevHash', () => {
    const result = AuditEvent.safeParse({
      ...validEvent,
      prevHash: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid uuid staffId', () => {
    const result = AuditEvent.safeParse({
      ...validEvent,
      staffId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('accepts string resourceId (no format validation when not null)', () => {
    const result = AuditEvent.safeParse({
      ...validEvent,
      resourceId: 'any-string-value',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid datetime', () => {
    const result = AuditEvent.safeParse({
      ...validEvent,
      createdAt: 'not-a-datetime',
    });
    expect(result.success).toBe(false);
  });
});

describe('AuditLogEntry', () => {
  const validEntry = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    staffId: '550e8400-e29b-41d4-a716-446655440001',
    actorEmail: 'user@example.com',
    actorName: 'John Doe',
    action: 'update',
    resourceType: 'user',
    resourceId: '550e8400-e29b-41d4-a716-446655440002',
    changes: { status: 'active' },
    ipAddr: '192.168.1.1',
    ua: 'Mozilla/5.0',
    prevHash: null,
    hash: '1111111111111111111111111111111111111111111111111111111111111111',
    createdAt: '2026-01-01T00:00:00Z',
  };

  it('parses valid audit log entry', () => {
    const result = AuditLogEntry.safeParse(validEntry);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.actorEmail).toBe('user@example.com');
      expect(result.data.action).toBe('update');
    }
  });

  it('accepts null actorEmail and actorName', () => {
    const result = AuditLogEntry.safeParse({
      ...validEntry,
      actorEmail: null,
      actorName: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('AuditListResponse', () => {
  const validEntry = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    staffId: null,
    actorEmail: null,
    actorName: null,
    action: 'create',
    resourceType: 'user',
    resourceId: null,
    changes: null,
    ipAddr: null,
    ua: null,
    prevHash: null,
    hash: '1111111111111111111111111111111111111111111111111111111111111111',
    createdAt: '2026-01-01T00:00:00Z',
  };

  const validResponse = {
    data: [validEntry],
    total: 100,
    page: 1,
    limit: 10,
  };

  it('parses valid list response', () => {
    const result = AuditListResponse.safeParse(validResponse);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.total).toBe(100);
      expect(result.data.data.length).toBe(1);
    }
  });

  it('accepts empty data array', () => {
    const result = AuditListResponse.safeParse({
      ...validResponse,
      data: [],
    });
    expect(result.success).toBe(true);
  });

  it('accepts any integer total', () => {
    const result = AuditListResponse.safeParse({
      ...validResponse,
      total: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-integer page', () => {
    const result = AuditListResponse.safeParse({
      ...validResponse,
      page: 1.5,
    });
    expect(result.success).toBe(false);
  });
});

describe('AuditVerifyResponse', () => {
  it('parses valid response', () => {
    const result = AuditVerifyResponse.safeParse({
      verified: true,
      checked: 100,
    });
    expect(result.success).toBe(true);
  });

  it('accepts optional brokenAt', () => {
    const result = AuditVerifyResponse.safeParse({
      verified: false,
      checked: 50,
      brokenAt: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-integer checked', () => {
    const result = AuditVerifyResponse.safeParse({
      verified: true,
      checked: 100.5,
    });
    expect(result.success).toBe(false);
  });
});
