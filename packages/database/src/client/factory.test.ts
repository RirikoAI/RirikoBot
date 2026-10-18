import { describe, it, expect, afterEach } from 'vitest';
import { createDatabaseClient, databaseConfigFromEnv, pingDatabase } from './factory.js';
import type { DatabaseClient } from './types.js';
import { DatabaseError } from '@ririko/core';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { SQLITE_MIGRATIONS } from '../migrations/generated/sqlite.js';
import { MIGRATIONS_TABLE } from '../migrations/runner.js';

describe('Database Client Factory', () => {
  let client: DatabaseClient | undefined;

  afterEach(async () => {
    if (client) {
      await client.close();
      client = undefined;
    }
  });

  describe('SQLite Client', () => {
    it('creates an in-memory SQLite client with ping verification', async () => {
      client = await createDatabaseClient({
        dialect: 'sqlite',
        url: ':memory:',
      });

      expect(client.dialect).toBe('sqlite');
      if (client.dialect === 'sqlite') {
        expect(client.raw.open).toBe(true);

        // Check foreign keys pragma
        const fkPragma = client.raw.pragma('foreign_keys', { simple: true });
        expect(fkPragma).toBe(1);
      }

      const ping = await pingDatabase(client);
      expect(ping.ok).toBe(true);
      expect(ping.dialect).toBe('sqlite');
      expect(ping.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('enables WAL mode and enforces foreign keys on file-based SQLite database', async () => {
      const testDir = path.join(process.cwd(), 'temp-test-db-wal');
      const dbPath = path.join(testDir, 'sub', 'test.sqlite');

      try {
        client = await createDatabaseClient({
          dialect: 'sqlite',
          url: dbPath,
          walMode: true,
          foreignKeys: true,
        });

        expect(client.dialect).toBe('sqlite');
        if (client.dialect === 'sqlite') {
          const journalMode = client.raw.pragma('journal_mode', { simple: true });
          expect(journalMode).toBe('wal');

          const fk = client.raw.pragma('foreign_keys', { simple: true });
          expect(fk).toBe(1);

          // Verify foreign key enforcement
          client.raw.exec(`
            CREATE TABLE parent (id INTEGER PRIMARY KEY);
            CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id));
          `);

          expect(() => {
            if (client?.dialect === 'sqlite') {
              client.raw.prepare('INSERT INTO child (id, parent_id) VALUES (1, 999)').run();
            }
          }).toThrow(/FOREIGN KEY constraint failed/i);
        }
      } finally {
        if (client) {
          await client.close();
          client = undefined;
        }
        if (fs.existsSync(testDir)) {
          fs.rmSync(testDir, { recursive: true, force: true });
        }
      }
    });

    const tableNames = (db: DatabaseClient): string[] => {
      if (db.dialect !== 'sqlite') throw new Error('Expected sqlite');
      return (
        db.raw
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
          )
          .all() as { name: string }[]
      ).map((row) => row.name);
    };

    it('creates no tables by itself, not even in a new database file', async () => {
      const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ririko-factory-'));
      try {
        client = await createDatabaseClient({
          dialect: 'sqlite',
          url: path.join(testDir, 'new.sqlite'),
        });
        expect(tableNames(client)).toEqual([]);
      } finally {
        await client?.close();
        client = undefined;
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });

    it('applies and records the migrations when autoMigrate is set (tests and throwaway databases)', async () => {
      client = await createDatabaseClient({
        dialect: 'sqlite',
        url: ':memory:',
        autoMigrate: true,
      });
      expect(tableNames(client)).toEqual(expect.arrayContaining(['users', MIGRATIONS_TABLE]));
      if (client.dialect !== 'sqlite') throw new Error('Expected sqlite');
      expect(client.raw.prepare(`SELECT id FROM ${MIGRATIONS_TABLE} ORDER BY id`).all()).toEqual(
        SQLITE_MIGRATIONS.map(({ id }) => ({ id })),
      );
    });

    it('handles closed SQLite connection in ping()', async () => {
      client = await createDatabaseClient({
        dialect: 'sqlite',
        url: ':memory:',
      });

      await client.close();
      const ping = await pingDatabase(client);

      expect(ping.ok).toBe(false);
      expect(ping.dialect).toBe('sqlite');
      expect(ping.error).toContain('closed');
    });

    it('throws DatabaseError when given an unsupported dialect', async () => {
      await expect(
        createDatabaseClient({
          dialect: 'mysql' as unknown as 'sqlite',
          url: 'mysql://localhost/test',
        }),
      ).rejects.toThrow(DatabaseError);
    });
  });

  describe('PostgreSQL Client', () => {
    it('creates a PostgreSQL client configuration with pool options', async () => {
      client = await createDatabaseClient({
        dialect: 'postgres',
        url: 'postgresql://user:pass@localhost:5432/testdb',
        maxConnections: 10,
        idleTimeoutMs: 10000,
      });

      expect(client.dialect).toBe('postgres');
      if (client.dialect === 'postgres') {
        expect(client.raw.options.max).toBe(10);
        expect(client.raw.options.idleTimeoutMillis).toBe(10000);
      }
    });

    it('rejects when autoMigrate cannot reach the server', async () => {
      await expect(
        createDatabaseClient({
          dialect: 'postgres',
          url: 'postgresql://invalid:invalid@127.0.0.1:54329/nonexistent',
          connectionTimeoutMs: 300,
          autoMigrate: true,
        }),
      ).rejects.toThrow();
    });

    it('returns ok: false on PostgreSQL ping when connection fails', async () => {
      client = await createDatabaseClient({
        dialect: 'postgres',
        url: 'postgresql://invalid:invalid@127.0.0.1:54329/nonexistent',
        connectionTimeoutMs: 300,
      });

      const ping = await pingDatabase(client);
      expect(ping.ok).toBe(false);
      expect(ping.dialect).toBe('postgres');
      expect(ping.error).toBeDefined();
    });
  });

  describe('databaseConfigFromEnv', () => {
    it('defaults to the SQLite file every entry point shares', () => {
      expect(databaseConfigFromEnv({})).toEqual({
        dialect: 'sqlite',
        url: './data/ririko.sqlite',
      });
    });

    it('treats empty values as unset', () => {
      expect(databaseConfigFromEnv({ DATABASE_DIALECT: '', DATABASE_URL: '' })).toEqual({
        dialect: 'sqlite',
        url: './data/ririko.sqlite',
      });
    });

    it('uses DATABASE_DIALECT and DATABASE_URL when set', () => {
      expect(
        databaseConfigFromEnv({
          DATABASE_DIALECT: 'postgres',
          DATABASE_URL: 'postgresql://ririko@db:5432/ririko',
        }),
      ).toEqual({ dialect: 'postgres', url: 'postgresql://ririko@db:5432/ririko' });
    });
  });
});
