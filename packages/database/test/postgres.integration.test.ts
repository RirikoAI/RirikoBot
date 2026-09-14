import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { connectDatabase } from '../src/index.js';
import type { DatabaseConnection } from '../src/index.js';
import { initialSettings, settingsContract } from './settings-contract.js';
import type { AuditRecord } from './settings-contract.js';

const postgresUrl = process.env.TEST_POSTGRES_URL;

describe.skipIf(!postgresUrl)('PostgreSQL settings store (requires TEST_POSTGRES_URL)', () => {
  let admin: postgres.Sql;
  let raw: postgres.Sql;
  let connection: DatabaseConnection;
  let schema: string;

  beforeEach(async () => {
    if (!postgresUrl) throw new Error('TEST_POSTGRES_URL is required.');
    admin = postgres(postgresUrl, { max: 1 });
    schema = 'ririko_test_' + randomUUID().replaceAll('-', '');
    await admin`CREATE SCHEMA ${admin(schema)}`;
    const scoped = new URL(postgresUrl);
    scoped.searchParams.set('search_path', schema);
    raw = postgres(scoped.toString(), { max: 1 });
    connection = await connectDatabase({ dialect: 'postgres', url: scoped.toString() });
  });

  afterEach(async () => {
    await connection?.close();
    await raw?.end({ timeout: 5 });
    if (admin) {
      try {
        if (!/^ririko_test_[a-f0-9]{32}$/.test(schema)) throw new Error('Unsafe test schema.');
        await admin`DROP SCHEMA IF EXISTS ${admin(schema)} CASCADE`;
      } finally { await admin.end({ timeout: 5 }); }
    }
  });

  settingsContract(() => connection, async () => {
    const rows = await raw<{ actor_id: string; before_revision: string; after_revision: string; before_settings: AuditRecord['beforeSettings']; after_settings: AuditRecord['afterSettings'] }[]>`
      SELECT actor_id, before_revision, after_revision, before_settings, after_settings
      FROM settings_audit ORDER BY after_revision`;
    return rows.map((row) => ({
      actorId: row.actor_id, beforeRevision: Number(row.before_revision), afterRevision: Number(row.after_revision),
      beforeSettings: row.before_settings, afterSettings: row.after_settings,
    }));
  });

  it('refuses foreign schemas without adding application tables', async () => {
    await raw`CREATE TABLE legacy_user (id TEXT PRIMARY KEY)`;
    await expect(connection.migrate()).rejects.toMatchObject({ code: 'FOREIGN_SCHEMA' });
    const rows = await raw<{ table_name: string }[]>`SELECT table_name FROM information_schema.tables WHERE table_schema = ${schema}`;
    expect(rows.map((row) => row.table_name)).toEqual(['legacy_user']);
  });

  it('rolls back settings when the audit constraint fails', async () => {
    await connection.migrate();
    const saved = await connection.settings.save(initialSettings, 0, '22');
    await raw`INSERT INTO settings_audit (id, guild_id, actor_id, before_revision, after_revision, after_settings, created_at)
      VALUES (${randomUUID()}, ${saved.guildId}, '33', 1, 2, ${JSON.stringify(saved)}::jsonb, ${new Date().toISOString()})`;
    await expect(connection.settings.save({ ...saved, prefix: '?' }, 1, '22')).rejects.toThrow();
    expect(await connection.settings.get(saved.guildId)).toEqual(saved);
  });
});
