import { describe, it, expect } from 'vitest';
import { createDatabaseClient } from '../client/factory.js';
import { withTransaction } from './index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import { eq } from 'drizzle-orm';

describe('withTransaction dual-dialect helper', () => {
  it('commits changes when callback resolves successfully', async () => {
    const client = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (client.dialect !== 'sqlite') throw new Error('Expected sqlite');

    client.raw.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        display_name TEXT,
        avatar_url TEXT,
        profile_background_url TEXT,
        is_blacklisted INTEGER NOT NULL DEFAULT 0,
        warn_count INTEGER NOT NULL DEFAULT 0,
        notify_level_up INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    const result = await withTransaction(client, async (txClient) => {
      txClient.db
        .insert(sqliteSchema.users)
        .values({
          id: 'user_success',
          username: 'SuccessUser',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .run();
      return 'done';
    });

    expect(result).toBe('done');

    const rows = client.db
      .select()
      .from(sqliteSchema.users)
      .where(eq(sqliteSchema.users.id, 'user_success'))
      .all();
    expect(rows.length).toBe(1);
    expect(rows[0]?.username).toBe('SuccessUser');

    await client.close();
  });

  it('rolls back all mutations when callback throws an error', async () => {
    const client = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (client.dialect !== 'sqlite') throw new Error('Expected sqlite');

    client.raw.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        display_name TEXT,
        avatar_url TEXT,
        profile_background_url TEXT,
        is_blacklisted INTEGER NOT NULL DEFAULT 0,
        warn_count INTEGER NOT NULL DEFAULT 0,
        notify_level_up INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    await expect(
      withTransaction(client, async (txClient) => {
        txClient.db
          .insert(sqliteSchema.users)
          .values({
            id: 'user_fail',
            username: 'FailUser',
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .run();

        throw new Error('Simulated transaction failure');
      }),
    ).rejects.toThrow('Simulated transaction failure');

    const rows = client.db
      .select()
      .from(sqliteSchema.users)
      .where(eq(sqliteSchema.users.id, 'user_fail'))
      .all();
    expect(rows.length).toBe(0);

    await client.close();
  });

  it('handles nested transactions with savepoint rollback', async () => {
    const client = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (client.dialect !== 'sqlite') throw new Error('Expected sqlite');

    client.raw.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        display_name TEXT,
        avatar_url TEXT,
        profile_background_url TEXT,
        is_blacklisted INTEGER NOT NULL DEFAULT 0,
        warn_count INTEGER NOT NULL DEFAULT 0,
        notify_level_up INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    await withTransaction(client, async (tx1) => {
      // Outer transaction insert
      tx1.db
        .insert(sqliteSchema.users)
        .values({
          id: 'user_outer',
          username: 'OuterUser',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .run();

      // Inner transaction that fails
      try {
        await withTransaction(tx1, async (tx2) => {
          tx2.db
            .insert(sqliteSchema.users)
            .values({
              id: 'user_inner_fail',
              username: 'InnerFail',
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .run();

          throw new Error('Inner failure');
        });
      } catch (err) {
        expect((err as Error).message).toBe('Inner failure');
      }

      // Inner transaction that succeeds
      await withTransaction(tx1, async (tx3) => {
        tx3.db
          .insert(sqliteSchema.users)
          .values({
            id: 'user_inner_ok',
            username: 'InnerOk',
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .run();
      });
    });

    // Outer and InnerOk should exist, InnerFail must NOT exist
    const rows = client.db.select().from(sqliteSchema.users).all();
    const ids = rows.map((r) => r.id).sort();
    expect(ids).toEqual(['user_inner_ok', 'user_outer']);

    await client.close();
  });
});
