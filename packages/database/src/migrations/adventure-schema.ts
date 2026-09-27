import { sql } from 'drizzle-orm';
import type { DatabaseClient } from '../client/types.js';
import { withTransaction } from '../transactions/index.js';

/** Additive, repeatable upgrade for existing databases; never resets game data. */
export const ADVENTURE_SCHEMA_DDL = [
  `CREATE TABLE IF NOT EXISTS adventure_settings (
    guild_id TEXT PRIMARY KEY NOT NULL, energy_enabled BOOLEAN NOT NULL DEFAULT TRUE
  )`,
  `CREATE TABLE IF NOT EXISTS adventure_players (
    user_id TEXT PRIMARY KEY NOT NULL, cooldown_until BIGINT NOT NULL DEFAULT 0, last_start_at BIGINT NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS adventure_sessions (
    id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL, revision INTEGER NOT NULL, delivered_revision INTEGER NOT NULL DEFAULT -1, status TEXT NOT NULL,
    deadline BIGINT NOT NULL, created_at BIGINT NOT NULL, payload TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_adventure_active_user ON adventure_sessions(user_id)
    WHERE status IN ('ACTIVE', 'SETTLING')`,
  `CREATE INDEX IF NOT EXISTS idx_adventure_due ON adventure_sessions(status, deadline)`,
  `CREATE INDEX IF NOT EXISTS idx_adventure_user_created ON adventure_sessions(user_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS adventure_choices (
    session_id TEXT NOT NULL REFERENCES adventure_sessions(id), revision INTEGER NOT NULL,
    payload TEXT NOT NULL, PRIMARY KEY(session_id, revision)
  )`,
] as const;

export async function ensureAdventureSchema(client: DatabaseClient): Promise<void> {
  await withTransaction(client, async (tx) => {
    // PostgreSQL DDL races need a transaction-wide lock even with IF NOT EXISTS.
    if (tx.dialect === 'postgres') await tx.db.execute(sql`SELECT pg_advisory_xact_lock(1702, 1)`);
    for (const statement of ADVENTURE_SCHEMA_DDL) {
      if (tx.dialect === 'sqlite') tx.raw.exec(statement);
      else await tx.db.execute(sql.raw(statement)); // Static application DDL, no user input.
    }
  });
}
