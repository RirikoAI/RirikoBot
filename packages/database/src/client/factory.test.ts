import { describe, it, expect, afterEach } from 'vitest';
import { createDatabaseClient, pingDatabase } from './factory.js';
import type { DatabaseClient } from './types.js';
import { DatabaseError } from '@ririko/core';
import * as path from 'node:path';
import * as fs from 'node:fs';

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
});
