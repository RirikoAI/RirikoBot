import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import { createDatabaseClient } from '../client/factory.js';
import type { PostgresDatabaseClient } from '../client/types.js';
import * as pgSchema from '../schema/pg/index.js';
import { ensurePostgresSchema } from './postgres-schema.js';
import { ensureTextIdColumns, TEXT_ID_COLUMNS } from './text-ids.js';

type Query = (text: string) => Promise<{ rows: Record<string, string>[] }>;

/** A PostgreSQL client that records its queries; `uuidColumns` is what the catalog reports. */
function fakeClient(uuidColumns: [string, string][], failOn?: RegExp) {
  const log: string[] = [];
  let released = 0;
  const query: Query = async (text) => {
    log.push(text);
    if (failOn?.test(text)) throw new Error('boom');
    if (text.includes('information_schema.columns')) {
      return {
        rows: uuidColumns.map(([table_name, column_name]) => ({
          table_name,
          column_name,
          data_type: 'uuid',
        })),
      };
    }
    return { rows: [] };
  };
  const client = {
    dialect: 'postgres',
    raw: { connect: async () => ({ query, release: () => released++ }) },
  } as unknown as PostgresDatabaseClient;
  return { client, log, released: () => released };
}

describe('TEXT_ID_COLUMNS', () => {
  it('lists exactly the text columns of the PostgreSQL schema that hold shared ids', () => {
    const byName = new Map<string, { type: string; hasDefault: boolean; primary: boolean }>();
    for (const table of Object.values(pgSchema)) {
      if (!(table instanceof PgTable)) continue;
      const config = getTableConfig(table);
      for (const column of config.columns) {
        byName.set(`${config.name}.${column.name}`, {
          type: column.getSQLType(),
          hasDefault: column.hasDefault,
          primary: column.primary,
        });
      }
    }
    for (const { table, column, primaryKey } of TEXT_ID_COLUMNS) {
      const found = byName.get(`${table}.${column}`);
      expect(found, `${table}.${column} exists`).toBeDefined();
      expect(found!.type, `${table}.${column} is text`).toBe('text');
      expect(found!.primary).toBe(primaryKey);
      // A primary key keeps a random-uuid default, as text.
      expect(found!.hasDefault).toBe(primaryKey);
    }
  });
});

describe('ensureTextIdColumns', () => {
  it('leaves SQLite alone', async () => {
    const client = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    expect(await ensureTextIdColumns(client)).toEqual([]);
    await client.close();
  });

  it('alters only the listed columns that are still uuid, under one locked transaction', async () => {
    const { client, log, released } = fakeClient([
      ['waifu_cards', 'id'],
      ['waifu_cards', 'asset_id'],
      ['economy_inventories', 'item_id'],
      // Uuid columns that stay uuid.
      ['user_cards', 'id'],
      ['economy_items', 'category_id'],
    ]);

    expect(await ensureTextIdColumns(client)).toEqual([
      'waifu_cards.id',
      'waifu_cards.asset_id',
      'economy_inventories.item_id',
    ]);

    expect(log[0]).toBe('BEGIN');
    expect(log[1]).toContain('pg_advisory_xact_lock(1704, 1)');
    expect(log.at(-1)).toBe('COMMIT');
    expect(log.filter((text) => text.startsWith('ALTER TABLE'))).toEqual([
      'ALTER TABLE "waifu_cards" ALTER COLUMN "id" DROP DEFAULT',
      'ALTER TABLE "waifu_cards" ALTER COLUMN "id" TYPE text USING "id"::text',
      'ALTER TABLE "waifu_cards" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text',
      'ALTER TABLE "waifu_cards" ALTER COLUMN "asset_id" DROP DEFAULT',
      'ALTER TABLE "waifu_cards" ALTER COLUMN "asset_id" TYPE text USING "asset_id"::text',
      'ALTER TABLE "economy_inventories" ALTER COLUMN "item_id" DROP DEFAULT',
      'ALTER TABLE "economy_inventories" ALTER COLUMN "item_id" TYPE text USING "item_id"::text',
    ]);
    expect(released()).toBe(1);
  });

  it('changes nothing when every column is already text', async () => {
    const { client, log, released } = fakeClient([['user_cards', 'id']]);

    expect(await ensureTextIdColumns(client)).toEqual([]);

    expect(log.some((text) => text.startsWith('ALTER TABLE'))).toBe(false);
    expect(log.at(-1)).toBe('COMMIT');
    expect(released()).toBe(1);
  });

  it('rolls back and releases the connection when an alteration fails', async () => {
    const { client, log, released } = fakeClient([['waifu_cards', 'id']], /TYPE text/);

    await expect(ensureTextIdColumns(client)).rejects.toThrow('boom');

    expect(log.at(-1)).toBe('ROLLBACK');
    expect(log).not.toContain('COMMIT');
    expect(released()).toBe(1);
  });
});

const url = process.env.TEST_POSTGRES_URL ?? process.env.ADVENTURE_TEST_POSTGRES_URL;

// Explicit opt-in only. Everything happens in a newly generated schema that is dropped afterwards.
describe.skipIf(!url)('ensureTextIdColumns on PostgreSQL', () => {
  const schema = `textids_test_${randomUUID().replaceAll('-', '')}`;
  let admin: PostgresDatabaseClient;
  let db: PostgresDatabaseClient;
  let created = false;

  const columnTypes = async (): Promise<Map<string, string>> => {
    const { rows } = await admin.raw.query<{ name: string; data_type: string }>(
      `SELECT table_name || '.' || column_name AS name, data_type FROM information_schema.columns
        WHERE table_schema = $1`,
      [schema],
    );
    return new Map(rows.map((row) => [row.name, row.data_type]));
  };

  beforeAll(async () => {
    admin = (await createDatabaseClient({
      dialect: 'postgres',
      url: url!,
    })) as PostgresDatabaseClient;
    await admin.raw.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    const isolated = new URL(url!);
    isolated.searchParams.set('options', `-c search_path=${schema}`);
    db = (await createDatabaseClient({
      dialect: 'postgres',
      url: isolated.toString(),
    })) as PostgresDatabaseClient;
    await ensurePostgresSchema(db);
  }, 60_000);

  afterAll(async () => {
    await db?.close();
    if (created && /^textids_test_[a-f0-9]{32}$/.test(schema)) {
      await admin.raw.query(`DROP SCHEMA "${schema}" CASCADE`);
    }
    await admin?.close();
  });

  it('does nothing on a schema bootstrapped with text columns', async () => {
    const before = await columnTypes();
    expect(await ensureTextIdColumns(db)).toEqual([]);
    expect(await columnTypes()).toEqual(before);
  });

  it('upgrades a database created with uuid columns in place, keeping its rows', async () => {
    // Recreate the schema as it was before BUG-0038: the same columns, but uuid.
    for (const { table, column, primaryKey } of TEXT_ID_COLUMNS) {
      const target = `ALTER TABLE "${schema}"."${table}" ALTER COLUMN "${column}"`;
      await admin.raw.query(`${target} DROP DEFAULT`);
      await admin.raw.query(`${target} TYPE uuid USING "${column}"::uuid`);
      if (primaryKey) await admin.raw.query(`${target} SET DEFAULT gen_random_uuid()`);
    }
    const before = await columnTypes();
    for (const { table, column } of TEXT_ID_COLUMNS) {
      expect(before.get(`${table}.${column}`)).toBe('uuid');
    }

    const conversationId = randomUUID();
    const cardId = randomUUID();
    const itemId = randomUUID();
    await db.raw.query(`INSERT INTO ai_conversations (id, user_id, model) VALUES ($1, 'u1', 'm')`, [
      conversationId,
    ]);
    await db.raw.query(
      `INSERT INTO ai_messages (conversation_id, role, content) VALUES ($1, 'USER', 'hi')`,
      [conversationId],
    );
    await db.raw.query(
      `INSERT INTO user_cards (user_id, card_id, serial_number) VALUES ('u1', $1, 1)`,
      [cardId],
    );
    await db.raw.query(`INSERT INTO economy_inventories (user_id, item_id) VALUES ('u1', $1)`, [
      itemId,
    ]);

    expect(await ensureTextIdColumns(db)).toEqual(
      TEXT_ID_COLUMNS.map(({ table, column }) => `${table}.${column}`),
    );

    const after = await columnTypes();
    for (const { table, column } of TEXT_ID_COLUMNS) {
      expect(after.get(`${table}.${column}`), `${table}.${column}`).toBe('text');
    }
    // Uuid columns that are not shared ids stay uuid.
    expect(after.get('user_cards.id')).toBe('uuid');
    expect(after.get('economy_items.category_id')).toBe('uuid');

    // The values keep their text form.
    const conversations = await db.raw.query<{ id: string }>('SELECT id FROM ai_conversations');
    expect(conversations.rows.map((row) => row.id)).toEqual([conversationId]);
    const messages = await db.raw.query<{ conversation_id: string }>(
      'SELECT conversation_id FROM ai_messages',
    );
    expect(messages.rows.map((row) => row.conversation_id)).toEqual([conversationId]);
    const owned = await db.raw.query<{ card_id: string }>('SELECT card_id FROM user_cards');
    expect(owned.rows.map((row) => row.card_id)).toEqual([cardId]);
    const bag = await db.raw.query<{ item_id: string }>('SELECT item_id FROM economy_inventories');
    expect(bag.rows.map((row) => row.item_id)).toEqual([itemId]);

    // Slug and prefixed ids are accepted now, and a primary key still gets a random default.
    await db.raw.query(
      `INSERT INTO user_cards (user_id, card_id, serial_number) VALUES ('u1', 'card_fire_001', 1)`,
    );
    await db.raw.query(`INSERT INTO ai_conversations (id, user_id, model) VALUES ($1, 'u1', 'm')`, [
      `conv_${randomUUID()}`,
    ]);
    const defaulted = await db.raw.query<{ id: string }>(
      `INSERT INTO waifu_assets (source_id, source_image_id, character_name, anime_title, image_hash)
       VALUES ('s', 'i', 'c', 'a', 'h') RETURNING id`,
    );
    expect(defaulted.rows[0]!.id).toMatch(/^[0-9a-f-]{36}$/);

    // A second run changes nothing.
    expect(await ensureTextIdColumns(db)).toEqual([]);
    expect(await columnTypes()).toEqual(after);
  }, 60_000);
});
