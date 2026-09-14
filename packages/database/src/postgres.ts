import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { guildSettingsSchema, snowflakeSchema } from '@ririko/core';
import type { DatabaseConnection } from './index.js';
import { inspectObjects, latestVersion, migrationChecksum, migrationStatements, verifyHistory } from './migrations.js';
import type { MigrationStatus } from './migrations.js';
import { guildSettings, settingsAudit } from './schema/postgres.js';
import { conflict, requireMigrated, validateSave } from './validation.js';

/** PostgreSQL client; connecting never creates or alters the schema. */
export function postgresConnection(url: string): DatabaseConnection {
  const client = postgres(url, {
    max: 5, connect_timeout: 10, idle_timeout: 20,
    connection: { statement_timeout: 5000, lock_timeout: 5000 },
  });
  const db = drizzle(client);

  async function status(sql: postgres.Sql | postgres.TransactionSql = client): Promise<MigrationStatus> {
    const objects = await sql<{ name: string }[]>`
      SELECT c.relname AS name FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = current_schema() AND c.relkind IN ('r', 'v', 'm', 'p', 'f')
      ORDER BY c.relname`;
    if (!inspectObjects(objects.map((row) => row.name))) return { current: 0, latest: latestVersion };
    const rows = await sql<{ version: number; checksum: string }[]>`SELECT version, checksum FROM ririko_schema_migrations ORDER BY version`;
    return verifyHistory(rows, 'postgres');
  }

  async function ready(): Promise<void> { requireMigrated((await status()).current); }

  return {
    settings: {
      async get(guildId) {
        snowflakeSchema.parse(guildId);
        await ready();
        const [row] = await db.select().from(guildSettings).where(eq(guildSettings.guildId, guildId));
        return row ? guildSettingsSchema.parse(row) : undefined;
      },
      async save(settings, expectedRevision, actorId) {
        const next = validateSave(settings, expectedRevision, actorId);
        await ready();
        return db.transaction(async (tx) => {
          const [beforeRow] = await tx.select().from(guildSettings).where(eq(guildSettings.guildId, next.guildId));
          const before = beforeRow ? guildSettingsSchema.parse(beforeRow) : null;
          if ((before?.revision ?? 0) !== expectedRevision) throw conflict();
          const [changed] = before
            ? await tx.update(guildSettings).set(next).where(and(eq(guildSettings.guildId, next.guildId), eq(guildSettings.revision, expectedRevision))).returning()
            : await tx.insert(guildSettings).values(next).onConflictDoNothing().returning();
          if (!changed) throw conflict();
          await tx.insert(settingsAudit).values({
            id: randomUUID(), guildId: next.guildId, actorId,
            beforeRevision: expectedRevision, afterRevision: next.revision,
            beforeSettings: before, afterSettings: next, createdAt: new Date().toISOString(),
          });
          return guildSettingsSchema.parse(changed);
        });
      },
    },
    async migrate() {
      await client.begin(async (tx) => {
        // Serialize schema migrations without requiring a pre-existing ledger table.
        await tx`SELECT pg_advisory_xact_lock(hashtext(current_database()), hashtext(current_schema()))`;
        if ((await status(tx)).current === latestVersion) return;
        for (const statement of migrationStatements('postgres')) await tx.unsafe(statement);
        await tx`INSERT INTO ririko_schema_migrations(version, checksum, applied_at) VALUES (${latestVersion}, ${migrationChecksum('postgres')}, ${new Date().toISOString()})`;
      });
    },
    migrationStatus: status,
    async healthCheck() { await ready(); await client`SELECT 1`; },
    async close() { await client.end({ timeout: 5 }); },
  };
}
