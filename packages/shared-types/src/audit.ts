import { z } from 'zod';

// Append-only, hash-chained audit log — 7-year retention per security spec
export const AuditEvent = z.object({
  id: z.string().uuid(),
  staffId: z.string().uuid().nullable(),
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.string().nullable(),
  // JSONB diff of before/after state
  changes: z.record(z.unknown()).nullable(),
  ipAddr: z.string().nullable(),
  ua: z.string().nullable(),
  // SHA-256 hash of previous entry — enables tamper detection
  prevHash: z.string().nullable(),
  hash: z.string(),
  createdAt: z.string().datetime(),
});
export type AuditEvent = z.infer<typeof AuditEvent>;

/**
 * Enriched audit log entry returned by the read API — includes actor info
 * joined from staff_members and derived hash validity.
 */
export const AuditLogEntry = z.object({
  id: z.string().uuid(),
  staffId: z.string().uuid().nullable(),
  actorEmail: z.string().nullable(),
  actorName: z.string().nullable(),
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.string().nullable(),
  changes: z.record(z.unknown()).nullable(),
  ipAddr: z.string().nullable(),
  ua: z.string().nullable(),
  prevHash: z.string().nullable(),
  hash: z.string(),
  createdAt: z.string(),
});
export type AuditLogEntry = z.infer<typeof AuditLogEntry>;

export const AuditListResponse = z.object({
  data: z.array(AuditLogEntry),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
});
export type AuditListResponse = z.infer<typeof AuditListResponse>;

export const AuditVerifyResponse = z.object({
  verified: z.boolean(),
  checked: z.number().int(),
  brokenAt: z.string().uuid().optional(),
});
export type AuditVerifyResponse = z.infer<typeof AuditVerifyResponse>;
