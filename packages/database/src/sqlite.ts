import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Sqlite from 'better-sqlite3';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { AppError, guildSettingsSchema, snowflakeSchema } from '@ririko/core';
import type { DatabaseConnection } from './index.js';
import { inspectObjects, latestVersion, migrationChecksum, migrationStatements, verifyHistory } from './migrations.js';
import type { MigrationStatus } from './migrations.js';
import { guildSettings, settingsAudit } from './schema/sqlite.js';
import { conflict, requireMigrated, validateSave } from './validation.js';

/** Lazy file opening keeps diagnostics from creating a database or directories. */
export function sqliteConnection(url: string): DatabaseConnection {
  if (!url.trim()) throw new AppError('VALIDATION', 'A SQLite database path is required.');
  const path = url === ':memory:' ? url : resolve(url);
  let client: Sqlite.Database | undefined;
  let writable = false;
  let closed = false;

  function open(write = false, create = false): Sqlite.Database | undefined {
    if (closed) throw new AppError('DATABASE_CLOSED', 'The database connection is closed.');
    if (client && (!write || writable)) return client;
    if (path !== ':memory:' && !create && !existsSync(path)) return undefined;
    if (client) client.close();
    client = undefined;
    if (create && path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    writable = write || path === ':memory:';
    client = new Sqlite(path, { readonly: !writable, fileMustExist: !create && path !== ':memory:', timeout: 5000 });
    client.pragma('foreign_keys = ON');
    return client;
  }

  function status(connection: Sqlite.Database | undefined = open()): MigrationStatus {
    if (!connection) return { current: 0, latest: latestVersion };
    const objects = connection.prepare<[], { name: string }>(
      "SELECT name FROM sqlite_master WHERE type IN ('table', 'view', 'trigger') AND name NOT LIKE 'sqlite_%' ORDER BY name",
    ).all();
    if (!inspectObjects(objects.map((row) => row.name))) return { current: 0, latest: latestVersion };
    const rows = connection.prepare<[], { version: number; checksum: string }>(
      'SELECT version, checksum FROM ririko_schema_migrations ORDER BY version',
    ).all();
    return verifyHistory(rows, 'sqlite');
  }

  function ready(write = false): Sqlite.Database {
    requireMigrated(status().current);
    const connection = open(write);
    if (!connection) throw new AppError('DATABASE_UNAVAILABLE', 'The database is unavailable.');
    return connection;
  }

  return {
    settings: {
      async get(guildId) {
        snowflakeSchema.parse(guildId);
        const row = drizzle(ready()).select().from(guildSettings).where(eq(guildSettings.guildId, guildId)).get();
        return row ? guildSettingsSchema.parse(row) : undefined;
      },
      async save(settings, expectedRevision, actorId) {
        const next = validateSave(settings, expectedRevision, actorId);
        const db = drizzle(ready(true));
        return db.transaction((tx) => {
          const beforeRow = tx.select().from(guildSettings).where(eq(guildSettings.guildId, next.guildId)).get();
          const before = beforeRow ? guildSettingsSchema.parse(beforeRow) : null;
          if ((before?.revision ?? 0) !== expectedRevision) throw conflict();
          const changed = before
            ? tx.update(guildSettings).set(next).where(and(eq(guildSettings.guildId, next.guildId), eq(guildSettings.revision, expectedRevision))).returning().get()
            : tx.insert(guildSettings).values(next).onConflictDoNothing().returning().get();
          if (!changed) throw conflict();
          tx.insert(settingsAudit).values({
            id: randomUUID(), guildId: next.guildId, actorId,
            beforeRevision: expectedRevision, afterRevision: next.revision,
            beforeSettings: before, afterSettings: next, createdAt: new Date().toISOString(),
          }).run();
          return guildSettingsSchema.parse(changed);
        }, { behavior: 'immediate' });
      },
    },
    async migrate() {
      const initial = status();
      if (initial.current === latestVersion) return;
      const connection = open(true, true);
      if (!connection) throw new AppError('DATABASE_UNAVAILABLE', 'The database is unavailable.');
      connection.transaction(() => {
        if (status(connection).current === latestVersion) return;
        for (const statement of migrationStatements('sqlite')) connection.exec(statement);
        connection.prepare('INSERT INTO ririko_schema_migrations(version, checksum, applied_at) VALUES (?, ?, ?)')
          .run(latestVersion, migrationChecksum('sqlite'), new Date().toISOString());
      }).immediate();
    },
    async migrationStatus() { return status(); },
    async healthCheck() {
      const connection = ready();
      connection.prepare('SELECT 1').get();
    },
    async close() {
      if (closed) return;
      client?.close();
      client = undefined;
      closed = true;
    },
  };
}
