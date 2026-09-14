import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import Sqlite from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { connectDatabase } from '../src/index.js';
import type { DatabaseConnection } from '../src/index.js';
import { initialSettings, settingsContract } from './settings-contract.js';
import type { AuditRecord } from './settings-contract.js';

describe('SQLite settings store', () => {
  let directory: string;
  let path: string;
  let connection: DatabaseConnection;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'ririko-db-test-'));
    path = join(directory, 'database.sqlite');
    connection = await connectDatabase({ dialect: 'sqlite', url: path });
  });

  afterEach(async () => {
    await connection.close();
    const absolute = resolve(directory);
    if (!absolute.startsWith(resolve(tmpdir()) + sep) || !basename(absolute).startsWith('ririko-db-test-')) throw new Error('Unsafe temporary directory.');
    await rm(absolute, { recursive: true, force: true });
  });

  async function readAudit(): Promise<AuditRecord[]> {
    const raw = new Sqlite(path, { readonly: true });
    try {
      return raw.prepare<[], { actor_id: string; before_revision: number; after_revision: number; before_settings: string | null; after_settings: string }>(
        'SELECT * FROM settings_audit ORDER BY after_revision',
      ).all().map((row) => ({
        actorId: row.actor_id, beforeRevision: row.before_revision, afterRevision: row.after_revision,
        beforeSettings: row.before_settings === null ? null : JSON.parse(row.before_settings) as AuditRecord['beforeSettings'],
        afterSettings: JSON.parse(row.after_settings) as AuditRecord['afterSettings'],
      }));
    } finally { raw.close(); }
  }

  settingsContract(() => connection, readAudit);

  it('does not create directories or files during connection and diagnostics', async () => {
    await connection.close();
    path = join(directory, 'nested', 'database.sqlite');
    connection = await connectDatabase({ dialect: 'sqlite', url: path });
    expect(await connection.migrationStatus()).toEqual({ current: 0, latest: 1 });
    await expect(connection.healthCheck()).rejects.toMatchObject({ code: 'MIGRATION_REQUIRED' });
    expect(existsSync(join(directory, 'nested'))).toBe(false);
    await connection.migrate();
    expect(existsSync(path)).toBe(true);
  });

  it('survives closing and reopening the database', async () => {
    await connection.migrate();
    const saved = await connection.settings.save(initialSettings, 0, '22');
    await connection.close();
    connection = await connectDatabase({ dialect: 'sqlite', url: path });
    expect(await connection.settings.get(initialSettings.guildId)).toEqual(saved);
    expect(await readAudit()).toHaveLength(1);
  });

  it('refuses legacy data without changing a source byte', async () => {
    const raw = new Sqlite(path);
    raw.exec('CREATE TABLE user (id TEXT PRIMARY KEY, coins INTEGER NOT NULL)');
    raw.prepare('INSERT INTO user VALUES (?, ?)').run(initialSettings.guildId, 42);
    raw.close();
    const before = createHash('sha256').update(await readFile(path)).digest('hex');
    await expect(connection.migrationStatus()).rejects.toMatchObject({ code: 'FOREIGN_SCHEMA' });
    await expect(connection.migrate()).rejects.toMatchObject({ code: 'FOREIGN_SCHEMA' });
    await expect(connection.healthCheck()).rejects.toMatchObject({ code: 'FOREIGN_SCHEMA' });
    await connection.close();
    expect(createHash('sha256').update(await readFile(path)).digest('hex')).toBe(before);
  });

  it('refuses modified migration checksums', async () => {
    await connection.migrate();
    const raw = new Sqlite(path);
    raw.prepare('UPDATE ririko_schema_migrations SET checksum = ?').run('tampered');
    raw.close();
    await expect(connection.migrate()).rejects.toMatchObject({ code: 'SCHEMA_INVALID' });
    await expect(connection.healthCheck()).rejects.toMatchObject({ code: 'SCHEMA_INVALID' });
  });

  it('refuses incomplete schemas without filling missing tables', async () => {
    const raw = new Sqlite(path);
    raw.exec('CREATE TABLE guild_settings (guild_id TEXT PRIMARY KEY)');
    raw.close();
    await expect(connection.migrate()).rejects.toMatchObject({ code: 'SCHEMA_INVALID' });
    const inspected = new Sqlite(path, { readonly: true });
    try {
      expect(inspected.prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'").all()).toEqual([{ name: 'guild_settings' }]);
    } finally { inspected.close(); }
  });

  it('rolls back the settings write if its audit insert fails', async () => {
    await connection.migrate();
    const saved = await connection.settings.save(initialSettings, 0, '22');
    const raw = new Sqlite(path);
    raw.prepare('INSERT INTO settings_audit (id, guild_id, actor_id, before_revision, after_revision, after_settings, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(randomUUID(), saved.guildId, '33', 1, 2, JSON.stringify(saved), new Date().toISOString());
    raw.close();
    await expect(connection.settings.save({ ...saved, prefix: '?' }, 1, '22')).rejects.toThrow();
    expect(await connection.settings.get(saved.guildId)).toEqual(saved);
  });

  it('supports isolated in-memory databases', async () => {
    const memory = await connectDatabase({ dialect: 'sqlite', url: ':memory:' });
    try {
      await memory.migrate();
      expect((await memory.settings.save(initialSettings, 0, '22')).revision).toBe(1);
    } finally { await memory.close(); }
    expect(existsSync(path)).toBe(false);
  });
});
