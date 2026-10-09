import { sql } from 'drizzle-orm';
import type { DatabaseClient } from '../client/types.js';
import { withTransaction } from '../transactions/index.js';

/**
 * Additive, repeatable upgrade for databases created before the bot recorded its servers:
 * `guilds.invited_by_id` holds the member who added the bot (TASK-1831) and `guilds.invited_via`
 * how that was learned (TASK-1841). Each column is checked on its own, so a database that already
 * has the first gets the second. A second run changes nothing, and the bot, the dashboard and
 * `db:copy` may run it at the same time. Returns whether it added a column.
 */
export async function ensureGuildRegistrySchema(client: DatabaseClient): Promise<boolean> {
  return withTransaction(client, async (tx) => {
    if (tx.dialect === 'postgres') {
      await tx.db.execute(sql`SELECT pg_advisory_xact_lock(1705, 1)`);
      const { rows } = await tx.db.execute(
        sql`SELECT column_name FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'guilds'
            AND column_name IN ('invited_by_id', 'invited_via')`,
      );
      await tx.db.execute(
        sql.raw('ALTER TABLE guilds ADD COLUMN IF NOT EXISTS invited_by_id varchar(32)'),
      );
      await tx.db.execute(
        sql.raw('ALTER TABLE guilds ADD COLUMN IF NOT EXISTS invited_via varchar(16)'),
      );
      return rows.length < 2;
    }
    // SQLite has no ADD COLUMN IF NOT EXISTS.
    const present = new Set(
      (tx.raw.prepare('PRAGMA table_info(guilds)').all() as { name: string }[]).map(
        (column) => column.name,
      ),
    );
    let added = false;
    for (const column of ['invited_by_id', 'invited_via']) {
      if (present.has(column)) continue;
      tx.raw.exec(`ALTER TABLE guilds ADD COLUMN ${column} text`);
      added = true;
    }
    return added;
  });
}
