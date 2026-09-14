import { createHash } from 'node:crypto';
import { AppError } from '@ririko/core';

/** Dialects with tested, independently versioned SQL migrations. */
export type DatabaseDialect = 'sqlite' | 'postgres';

/** Current and available schema versions; zero means no foundation schema. */
export interface MigrationStatus { current: number; latest: number }

export const latestVersion = 1;
export const managedTables = ['ririko_schema_migrations', 'guild_settings', 'settings_audit'] as const;

/** SQL is fixed application code. User input is never interpolated here. */
export function migrationStatements(dialect: DatabaseDialect): readonly string[] {
  const json = dialect === 'sqlite' ? 'TEXT' : 'JSONB';
  const revision = dialect === 'sqlite' ? 'INTEGER' : 'BIGINT';
  return [
    `CREATE TABLE ririko_schema_migrations (version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)`,
    `CREATE TABLE guild_settings (guild_id TEXT PRIMARY KEY NOT NULL, prefix TEXT NOT NULL, modules ${json} NOT NULL, commands ${json} NOT NULL, revision ${revision} NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740990))`,
    `CREATE TABLE settings_audit (id TEXT PRIMARY KEY NOT NULL, guild_id TEXT NOT NULL REFERENCES guild_settings(guild_id), actor_id TEXT NOT NULL, before_revision ${revision} NOT NULL CHECK (before_revision >= 0), after_revision ${revision} NOT NULL CHECK (after_revision = before_revision + 1), before_settings ${json}, after_settings ${json} NOT NULL, created_at TEXT NOT NULL)`,
    'CREATE UNIQUE INDEX settings_audit_guild_revision ON settings_audit(guild_id, after_revision)',
  ];
}

/** Hash is dialect-specific and immutable once a schema version is released. */
export function migrationChecksum(dialect: DatabaseDialect): string {
  return createHash('sha256').update(migrationStatements(dialect).join('\n')).digest('hex');
}

/** Refuse legacy/unrecognized objects before running any schema mutation. */
export function inspectObjects(names: readonly string[]): boolean {
  const expected = new Set<string>(managedTables);
  if (names.some((name) => !expected.has(name))) {
    throw new AppError('FOREIGN_SCHEMA', 'This database contains a legacy or unrecognized schema. Use a separate database for Ririko 2.0.');
  }
  if (names.length === 0) return false;
  if (names.length !== managedTables.length || !managedTables.every((name) => names.includes(name))) {
    throw new AppError('SCHEMA_INVALID', 'The Ririko schema is incomplete. Restore a verified backup before continuing.');
  }
  return true;
}

/** Reject tampered, missing and future migration history without auto-repair. */
export function verifyHistory(rows: readonly { version: number; checksum: string }[], dialect: DatabaseDialect): MigrationStatus {
  if (rows.length !== 1 || rows[0]?.version !== latestVersion || rows[0].checksum !== migrationChecksum(dialect)) {
    throw new AppError('SCHEMA_INVALID', 'Database migration history does not match this release.');
  }
  return { current: latestVersion, latest: latestVersion };
}
