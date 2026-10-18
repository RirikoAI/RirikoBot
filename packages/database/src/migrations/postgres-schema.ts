import type { DatabaseClient } from '../client/types.js';
import { PG_SCHEMA_DDL } from '../schema/pg/ddl.js';

/**
 * Creates the full 2.0 schema from `PG_SCHEMA_DDL` in an empty PostgreSQL schema (the
 * connection's `search_path`). A schema that already has tables is left alone. Nothing at runtime
 * calls it any more: the bot, the CLI and `db:copy` use `migrateDatabase` (ADR-015). It stays for
 * the tests that need the bare DDL schema, such as the ones of the text id repair. The check and
 * the DDL run under one transaction-wide advisory lock. Does nothing on SQLite. Returns whether it
 * created the schema.
 */
export async function ensurePostgresSchema(client: DatabaseClient): Promise<boolean> {
  if (client.dialect !== 'postgres') return false;
  const connection = await client.raw.connect();
  try {
    await connection.query('BEGIN');
    try {
      await connection.query('SELECT pg_advisory_xact_lock(1701, 1)');
      const { rows } = await connection.query<{ count: string }>(
        `SELECT count(*) AS count FROM information_schema.tables
          WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'`,
      );
      const empty = Number(rows[0]?.count ?? 0) === 0;
      // Static generated DDL, no user input; the simple query protocol runs every statement.
      if (empty) await connection.query(PG_SCHEMA_DDL);
      await connection.query('COMMIT');
      return empty;
    } catch (error) {
      await connection.query('ROLLBACK').catch(() => undefined);
      throw error;
    }
  } finally {
    connection.release();
  }
}
