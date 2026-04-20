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
