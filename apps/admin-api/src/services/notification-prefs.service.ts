// notification-prefs.service — cached per-staff prefs + role-to-staffIds expansion.
// Cache TTL: 60 seconds (acceptable staleness for a prefs lookup).
import { eq } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import * as schema from '../db/schema/index.js';
import { DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs } from '../db/schema/notifications.js';

// ── In-process LRU-style TTL cache (Map + timestamp) ─────────────────────────

const CACHE_TTL_MS = 60_000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const prefsCache = new Map<string, CacheEntry<NotificationPrefs>>();
const roleCache = new Map<string, CacheEntry<string[]>>();

function getCached<T>(map: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const entry = map.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    map.delete(key);
    return undefined;
  }
  return entry.value;
}

function setCache<T>(map: Map<string, CacheEntry<T>>, key: string, value: T): void {
  map.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── Prefs lookup ──────────────────────────────────────────────────────────────

/**
 * Return the notification prefs for a staff member.
 * Falls back to DEFAULT_NOTIFICATION_PREFS if the row has no prefs set.
 * Result cached 60 s.
 */
export async function getStaffPrefs(db: Db, staffId: string): Promise<NotificationPrefs> {
  const cached = getCached(prefsCache, staffId);
  if (cached) return cached;

  const row = await db.query.staffMembers.findFirst({
    where: eq(schema.staffMembers.id, staffId),
    columns: { notificationPrefs: true },
  });

  const prefs = row?.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS;
  setCache(prefsCache, staffId, prefs);
  return prefs;
}

/** Invalidate the cached prefs for a staff member after a PATCH update */
export function invalidateStaffPrefsCache(staffId: string): void {
  prefsCache.delete(staffId);
}

// ── Role → staff IDs expansion ────────────────────────────────────────────────

type StaffRole = 'admin' | 'treasurer' | 'operator' | 'viewer' | 'ops';

/**
 * Return all active staff IDs with the given role.
 * 'ops' is mapped to 'operator' (the DB enum value).
 * Result cached 60 s per role.
 */
export async function getStaffIdsByRole(db: Db, role: StaffRole): Promise<string[]> {
  // Map convenience alias
  const dbRole = role === 'ops' ? 'operator' : role;
  const cacheKey = `role:${dbRole}`;

  const cached = getCached(roleCache, cacheKey);
  if (cached) return cached;

  const rows = await db
    .select({ id: schema.staffMembers.id })
    .from(schema.staffMembers)
    .where(eq(schema.staffMembers.role, dbRole as typeof schema.staffMembers.$inferSelect.role));

  const ids = rows.map((r) => r.id);
  setCache(roleCache, cacheKey, ids);
  return ids;
}

/** Invalidate role cache entry (call after staff role changes) */
export function invalidateRoleCache(role: StaffRole): void {
  const dbRole = role === 'ops' ? 'operator' : role;
  roleCache.delete(`role:${dbRole}`);
}
