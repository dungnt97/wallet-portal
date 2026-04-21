// kill-switch-db-query — lightweight helper for wallet-engine workers.
// Queries the system_kill_switch singleton directly via the shared DB client.
// Workers call this BEFORE broadcasting to avoid sending a tx when paused.
import type { Db } from '../db/client.js';

/**
 * Returns true when the global kill-switch is enabled.
 * Defaults to false if the row is missing (migration not yet applied).
 */
export async function isKillSwitchEnabled(db: Db): Promise<boolean> {
  // Raw SQL to avoid importing admin-api's full schema in wallet-engine.
  // The table is guaranteed by migration 0010_kill_switch.sql.
  type Row = { enabled: boolean };
  const rows = await db.execute<Row>(
    'SELECT enabled FROM system_kill_switch WHERE id = 1' as unknown as Parameters<
      typeof db.execute
    >[0]
  );
  if (!rows || rows.length === 0) return false;
  return Boolean(rows[0]?.enabled);
}
