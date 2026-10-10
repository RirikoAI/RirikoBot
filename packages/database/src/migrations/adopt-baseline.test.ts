import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import DatabaseConstructor from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabaseClient } from '../client/factory.js';
import type { DatabaseClient, PostgresDatabaseClient } from '../client/types.js';
import { PG_SCHEMA_DDL } from '../schema/pg/ddl.js';
import { SQLITE_SCHEMA_DDL } from '../schema/sqlite/ddl.js';
import {
  BASELINE_ID,
  planAdoption,
  postgresBaselineShape,
  readCurrentPostgresShape,
  readSqliteShape,
  sqliteAffinity,
  sqliteBaselineShape,
  type ColumnShape,
  type SchemaShape,
  DUPLICATE_SERIALS_MESSAGE,
} from './adopt-baseline.js';
import type { EmbeddedMigration } from './embedded.js';
import { PG_MIGRATIONS } from './generated/pg.js';
import { SQLITE_MIGRATIONS } from './generated/sqlite.js';
import { migrateDatabase, MIGRATIONS_TABLE } from './runner.js';

function migration(id: string, statements: string[]): EmbeddedMigration {
  return {
    id,
    statements,
    checksum: createHash('sha256').update(statements.join('\n')).digest('hex'),
    contract: false,
  };
}

const extra = migration('0001_extra', ['CREATE TABLE adoption_extra (id integer PRIMARY KEY)']);

// --- Pure planning ----------------------------------------------------------------------------

const col = (type: string, options: Partial<ColumnShape> = {}): ColumnShape => ({
  type,
  notNull: false,
  default: null,
  primaryKey: false,
  generated: false,
  ...options,
});

const shape = (
  tables: Record<string, Record<string, ColumnShape>>,
  indexes: Record<string, string> = {},
): SchemaShape => ({
  tables: new Map(
    Object.entries(tables).map(([name, cols]) => [name, new Map(Object.entries(cols))]),
  ),
  indexes: new Map(Object.entries(indexes)),
});

describe('planAdoption', () => {
  const statements = [
    'CREATE TABLE "a" ("id" text PRIMARY KEY NOT NULL, "n" integer DEFAULT 1 NOT NULL);',
    'CREATE UNIQUE INDEX "idx_a_n" ON "a" ("n");',
    'CREATE TABLE "b" ("id" text PRIMARY KEY NOT NULL, "a_id" text NOT NULL);',
    'ALTER TABLE "b" ADD CONSTRAINT "b_a_fk" FOREIGN KEY ("a_id") REFERENCES "a"("id");',
  ];
  const expected = shape(
    {
      a: {
        id: col('text', { notNull: true, primaryKey: true }),
        n: col('integer', { notNull: true, default: '1' }),
      },
      b: {
        id: col('text', { notNull: true, primaryKey: true }),
        a_id: col('text', { notNull: true }),
      },
    },
    { idx_a_n: 'a' },
  );
  const plan = (live: SchemaShape, dialect: 'sqlite' | 'postgres' = 'postgres') =>
    planAdoption({ dialect, statements, expected, live });

  it('plans nothing for a live schema that equals the baseline', () => {
    const result = plan(expected);
    expect(result).toEqual({
      statements: [],
      problems: [],
      notes: [],
      createdTables: [],
      addedColumns: [],
      createdIndexes: [],
    });
  });

  it('creates a missing table with its foreign key, a missing index, and adds a defaulted column', () => {
    const live = shape({ a: { id: col('text', { notNull: true, primaryKey: true }) } });
    const result = plan(live);
    expect(result.problems).toEqual([]);
    expect(result.statements).toEqual([
      'ALTER TABLE "a" ADD COLUMN "n" integer DEFAULT 1 NOT NULL',
      statements[1],
      statements[2],
      statements[3],
    ]);
    expect(result.createdTables).toEqual(['b']);
    expect(result.addedColumns).toEqual(['a.n']);
    expect(result.createdIndexes).toEqual(['idx_a_n']);
  });

  it('does not recreate a foreign key for a table that already exists', () => {
    expect(plan(expected).statements).not.toContain(statements[3]);
  });

  it('adds a nullable column without a default', () => {
    const wanted = shape({ a: { id: col('text'), note: col('text') } });
    const result = planAdoption({
      dialect: 'sqlite',
      statements: ['CREATE TABLE `a` (`id` text, `note` text);'],
      expected: wanted,
      live: shape({ a: { id: col('text') } }),
    });
    expect(result.statements).toEqual(['ALTER TABLE "a" ADD COLUMN "note" text']);
  });

  it('refuses every problem at once and creates nothing', () => {
    const live = shape({
      a: {
        id: col('text', { notNull: true, primaryKey: true }),
        n: col('bigint', { notNull: true }),
      },
      b: { id: col('text', { notNull: true, primaryKey: true }) },
    });
    const result = plan(live);
    expect(result.problems).toHaveLength(2);
    expect(result.problems[0]).toContain('"a.n" is bigint but the baseline has integer');
    expect(result.problems[1]).toContain('"b.a_id" is missing and is NOT NULL without a default');
  });

  it('refuses a missing primary key, generated and non-constant default column', () => {
    const wanted = shape({
      t: {
        id: col('integer', { notNull: true, primaryKey: true }),
        g: col('integer', { generated: true }),
        at: col('integer', { default: 'CURRENT_TIMESTAMP' }),
        ok: col('integer', { default: '0' }),
      },
    });
    const result = planAdoption({
      dialect: 'sqlite',
      statements: ['CREATE TABLE `t` (`id` integer);'],
      expected: wanted,
      live: shape({ t: {} }),
    });
    expect(result.problems).toHaveLength(3);
    expect(result.problems.join('\n')).toMatch(/"t.id".*primary key/);
    expect(result.problems.join('\n')).toMatch(/"t.g".*generated/);
    expect(result.problems.join('\n')).toMatch(/"t.at".*CURRENT_TIMESTAMP.*not a constant/);
    expect(result.addedColumns).toEqual(['t.ok']);
  });

  it('only reports extra tables and columns and differing nullability', () => {
    const live = shape({
      a: {
        id: col('text', { notNull: true, primaryKey: true }),
        n: col('integer', { default: '1' }),
        legacy: col('text'),
      },
      b: expected.tables.get('b') ? Object.fromEntries(expected.tables.get('b')!) : {},
      old_table: { id: col('text') },
      [MIGRATIONS_TABLE]: { id: col('text') },
    });
    const result = planAdoption({
      dialect: 'postgres',
      statements,
      expected,
      live,
      ignoreTables: [MIGRATIONS_TABLE],
    });
    expect(result.problems).toEqual([]);
    expect(result.statements).toEqual([statements[1]]);
    expect(result.notes).toEqual([
      '"a.n" is nullable but the baseline has it NOT NULL; left as it is',
      'Extra column "a.legacy" is not in the baseline; kept',
      'Extra table "old_table" is not in the baseline; kept',
    ]);
  });

  describe('SQLite type affinity', () => {
    it.each([
      ['INTEGER', 'INTEGER'],
      ['BIGINT', 'INTEGER'],
      ['UNSIGNED BIG INT', 'INTEGER'],
      ['TEXT', 'TEXT'],
      ['VARCHAR(32)', 'TEXT'],
      ['NCHAR(55)', 'TEXT'],
      ['CLOB', 'TEXT'],
      ['BLOB', 'BLOB'],
      ['', 'BLOB'],
      ['REAL', 'REAL'],
      ['DOUBLE PRECISION', 'REAL'],
      ['FLOAT', 'REAL'],
      ['NUMERIC', 'NUMERIC'],
      ['BOOLEAN', 'NUMERIC'],
      ['DECIMAL(10,5)', 'NUMERIC'],
      ['DATETIME', 'NUMERIC'],
      // The rules apply in order: INT beats CHAR, and "POINT" holds INT.
      ['CHARINT', 'INTEGER'],
      ['POINT', 'INTEGER'],
      ['TEXTBLOB', 'TEXT'],
    ])('%j has %s affinity', (declared, affinity) => {
      expect(sqliteAffinity(declared)).toBe(affinity);
      expect(sqliteAffinity(declared.toLowerCase())).toBe(affinity);
    });

    const b = Object.fromEntries(expected.tables.get('b')!);
    const live = (type: string, notNull = true) =>
      shape({
        a: {
          id: col('text', { notNull: true, primaryKey: true }),
          n: col(type, { notNull, default: '1' }),
        },
        b,
      });

    it('notes a SQLite type that differs from the baseline but has the same affinity', () => {
      const result = plan(live('BIGINT'), 'sqlite');
      expect(result.problems).toEqual([]);
      expect(result.statements).toEqual([statements[1]]);
      expect(result.notes).toEqual([
        '"a.n" is BIGINT, the baseline has integer (same SQLite affinity); left as it is',
      ]);
    });

    it('still reports nullability when it notes a same-affinity type', () => {
      expect(plan(live('BIGINT', false), 'sqlite').notes).toEqual([
        '"a.n" is BIGINT, the baseline has integer (same SQLite affinity); left as it is',
        '"a.n" is nullable but the baseline has it NOT NULL; left as it is',
      ]);
    });

    it('notes NUMERIC affinity against an INTEGER baseline, because whole numbers are stored alike', () => {
      for (const type of ['BOOLEAN', 'NUMERIC', 'DATETIME']) {
        const result = plan(live(type), 'sqlite');
        expect(result.problems).toEqual([]);
        expect(result.notes).toEqual([
          `"a.n" is ${type}, the baseline has integer (NUMERIC and INTEGER affinity both store whole numbers as INTEGER); left as it is`,
        ]);
      }
    });

    it('notes INTEGER affinity against a NUMERIC baseline', () => {
      const wanted = shape({
        a: {
          id: col('text', { notNull: true, primaryKey: true }),
          n: col('NUMERIC', { notNull: true, default: '1' }),
        },
        b,
      });
      const result = planAdoption({
        dialect: 'sqlite',
        statements,
        expected: wanted,
        live: live('INTEGER'),
      });
      expect(result.problems).toEqual([]);
      expect(result.notes).toEqual([
        '"a.n" is INTEGER, the baseline has NUMERIC (INTEGER and NUMERIC affinity both store whole numbers as INTEGER); left as it is',
      ]);
    });

    it('still refuses a SQLite type with another affinity', () => {
      for (const type of ['TEXT', 'VARCHAR(8)', 'REAL', 'DOUBLE', 'BLOB', '']) {
        expect(plan(live(type), 'sqlite').problems).toEqual([
          `"a.n" is ${type || '(no type)'} but the baseline has integer`,
        ]);
      }
    });

    it('compares PostgreSQL types exactly', () => {
      expect(plan(live('bigint'), 'postgres').problems).toEqual([
        '"a.n" is bigint but the baseline has integer',
      ]);
    });
  });

  it('rejects a baseline statement it does not understand', () => {
    expect(() =>
      planAdoption({
        dialect: 'postgres',
        statements: ['DROP TABLE a'],
        expected: shape({}),
        live: shape({}),
      }),
    ).toThrow(/does not understand/);
  });
});

// --- Adoption on both dialects ----------------------------------------------------------------

interface Env {
  readonly client: DatabaseClient;
  exec(sql: string): Promise<void>;
  rows(sql: string): Promise<Record<string, unknown>[]>;
  /** The live shape, without the tracking table. */
  liveShape(): Promise<SchemaShape>;
  /** The baseline's shape, from a scratch database. */
  baselineShape(): Promise<SchemaShape>;
  tables(): Promise<string[]>;
  open?(): Promise<PostgresDatabaseClient>;
  dispose(): Promise<void>;
}

const postgresUrl = process.env.TEST_POSTGRES_URL ?? process.env.ADVENTURE_TEST_POSTGRES_URL;

const baselineOf = (dialect: 'sqlite' | 'postgres'): EmbeddedMigration =>
  (dialect === 'sqlite' ? SQLITE_MIGRATIONS : PG_MIGRATIONS).find(
    (each) => each.id === BASELINE_ID,
  )!;

const withoutTracking = (value: SchemaShape): SchemaShape => {
  const tables = new Map(value.tables);
  tables.delete(MIGRATIONS_TABLE);
  return { tables, indexes: value.indexes };
};

async function sqliteEnv(): Promise<Env> {
  const client = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
  if (client.dialect !== 'sqlite') throw new Error('expected SQLite');
  return {
    client,
    async exec(sql) {
      client.raw.exec(sql);
    },
    async rows(sql) {
      return client.raw.prepare(sql).all() as Record<string, unknown>[];
    },
    async liveShape() {
      return withoutTracking(readSqliteShape(client.raw));
    },
    async baselineShape() {
      return sqliteBaselineShape(baselineOf('sqlite').statements);
    },
    async tables() {
      return [...readSqliteShape(client.raw).tables.keys()];
    },
    dispose: () => client.close(),
  };
}

async function postgresEnv(): Promise<Env> {
  const schema = `adopt_test_${randomUUID().replaceAll('-', '')}`;
  const admin = (await createDatabaseClient({
    dialect: 'postgres',
    url: postgresUrl!,
  })) as PostgresDatabaseClient;
  await admin.raw.query(`CREATE SCHEMA "${schema}"`);
  const opened: PostgresDatabaseClient[] = [];
  const open = async () => {
    const url = new URL(postgresUrl!);
    url.searchParams.set('options', `-c search_path=${schema}`);
    const created = (await createDatabaseClient({
      dialect: 'postgres',
      url: url.toString(),
    })) as PostgresDatabaseClient;
    opened.push(created);
    return created;
  };
  const client = await open();
  const connected = async <T>(fn: (connection: import('pg').PoolClient) => Promise<T>) => {
    const connection = await client.raw.connect();
    try {
      return await fn(connection);
    } finally {
      connection.release();
    }
  };
  return {
    client,
    open,
    async exec(sql) {
      await client.raw.query(sql);
    },
    async rows(sql) {
      return (await client.raw.query(sql)).rows;
    },
    liveShape: () => connected(async (c) => withoutTracking(await readCurrentPostgresShape(c))),
    baselineShape: () =>
      connected((c) => postgresBaselineShape(c, baselineOf('postgres').statements)),
    async tables() {
      return [...(await connected((c) => readCurrentPostgresShape(c))).tables.keys()];
    },
    async dispose() {
      for (const each of opened) await each.close();
      if (/^adopt_test_[a-f0-9]{32}$/.test(schema)) {
        await admin.raw.query(`DROP SCHEMA "${schema}" CASCADE`);
      }
      await admin.close();
    },
  };
}

const columnNames = (value: SchemaShape): Record<string, string[]> =>
  Object.fromEntries([...value.tables].map(([table, cols]) => [table, [...cols.keys()].sort()]));

const recorder = () => {
  const warnings: string[] = [];
  const infos: string[] = [];
  return {
    warnings,
    infos,
    log: {
      info: (message: string) => void infos.push(message),
      warn: (message: string) => void warnings.push(message),
    },
  };
};

/**
 * A small baseline that both dialects accept as written. Most behaviour is tested against it, so
 * PostgreSQL does not build the 93-table schema for every test; the real baseline is used by the
 * tests that need its real tables.
 */
const MINI_STATEMENTS = [
  'CREATE TABLE "mini_guilds" ("id" text PRIMARY KEY NOT NULL, "name" text NOT NULL, "score" integer DEFAULT 0 NOT NULL, "note" text);',
  'CREATE UNIQUE INDEX "uq_mini_guilds_name" ON "mini_guilds" ("name");',
  'CREATE TABLE "user_cards" ("id" text PRIMARY KEY NOT NULL, "card_id" text NOT NULL, "serial_number" integer NOT NULL);',
  'CREATE UNIQUE INDEX "idx_user_cards_serial_unique" ON "user_cards" ("card_id", "serial_number");',
  'CREATE TABLE "mini_logs" ("id" text PRIMARY KEY NOT NULL, "guild_id" text NOT NULL);',
];
const mini = migration('0000_baseline', MINI_STATEMENTS);

describe.each(['sqlite', 'postgres'] as const)('adoption [%s]', (dialect) => {
  describe.skipIf(dialect === 'postgres' && !postgresUrl)('existing database', () => {
    let env: Env;
    const baseline = baselineOf(dialect);
    const baselinePlusExtra = [baseline, extra];
    const stamp = dialect === 'sqlite' ? '1000' : 'now()';

    beforeEach(async () => {
      env = dialect === 'sqlite' ? await sqliteEnv() : await postgresEnv();
    });
    afterEach(async () => {
      await env.dispose();
    });

    /** The database as the old startup path built it: the full DDL, no tracking table. */
    const buildFromFullDdl = () =>
      env.exec(dialect === 'sqlite' ? SQLITE_SCHEMA_DDL : PG_SCHEMA_DDL);

    /** The whole mini baseline, then `edit` to make it drift. */
    async function miniDatabase(...edits: string[]): Promise<void> {
      for (const statement of MINI_STATEMENTS) await env.exec(statement);
      for (const edit of edits) await env.exec(edit);
    }

    // --- The real baseline ----------------------------------------------------------------

    it('records the baseline for a database built from the full DDL, changes nothing, and does nothing on a second run', async () => {
      await buildFromFullDdl();
      const before = columnNames(await env.liveShape());
      const { log, warnings } = recorder();

      const result = await migrateDatabase(env.client, { migrations: baselinePlusExtra, log });

      expect(warnings).toEqual([]);
      expect(result.adoption).toEqual({
        createdTables: [],
        addedColumns: [],
        createdIndexes: [],
        notes: [],
      });
      expect(result.applied).toEqual([extra.id]);
      const rows = await env.rows(
        `SELECT id, checksum, contract, adopted FROM ${MIGRATIONS_TABLE} ORDER BY id`,
      );
      expect(rows.map((row) => row.id)).toEqual([baseline.id, extra.id]);
      expect(rows[0]!.checksum).toBe(baseline.checksum);
      expect(rows.map((row) => Boolean(row.adopted))).toEqual([true, false]);
      const after = columnNames(await env.liveShape());
      delete after.adoption_extra;
      expect(after).toEqual(before);

      const snapshot = await env.rows(`SELECT * FROM ${MIGRATIONS_TABLE} ORDER BY id`);
      const again = await migrateDatabase(env.client, { migrations: baselinePlusExtra });
      expect(again).toEqual({
        applied: [],
        alreadyApplied: [baseline.id, extra.id],
        unknown: [],
        backupPath: null,
        adoption: null,
      });
      expect(await env.rows(`SELECT * FROM ${MIGRATIONS_TABLE} ORDER BY id`)).toEqual(snapshot);
    });

    it('repairs a staging-shaped database without losing or changing a row', async () => {
      await buildFromFullDdl();
      const dropped = [
        ['guild_welcomer', 'background_file'],
        ['guild_farewell', 'background_file'],
        ['free_game_channels', 'mention_role_id'],
        ['guilds', 'invited_by_id'],
        ['guilds', 'invited_via'],
        ...[
          'tcg_drops_enabled',
          'tcg_drop_channel_id',
          'tcg_drop_message_threshold',
          'tcg_drop_start_hour',
          'tcg_drop_end_hour',
          'tcg_drop_claim_timeout_seconds',
          'tcg_drop_cooldown_minutes',
          'tcg_manager_role_id',
        ].map((column) => ['guild_settings', column]),
      ] as const;
      for (const [table, column] of dropped) {
        await env.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
      }
      await env.exec(
        `INSERT INTO guild_welcomer (guild_id, channel_id, message_template) VALUES ('g1', 'c1', 'Hello {user}')`,
      );
      await env.exec(
        `INSERT INTO guild_farewell (guild_id, channel_id, text_color) VALUES ('g1', 'c2', '#000000')`,
      );
      await env.exec(
        `INSERT INTO free_game_channels (guild_id, channel_id, created_at) VALUES ('g1', 'c3', ${stamp})`,
      );
      await env.exec(
        `INSERT INTO guild_settings (guild_id, prefix, created_at, updated_at) VALUES ('g1', '?', ${stamp}, ${stamp}), ('g2', '!', ${stamp}, ${stamp})`,
      );
      await env.exec(
        `INSERT INTO guilds (id, name, owner_id, joined_at, created_at, updated_at) VALUES ('g1', 'Guild One', 'o1', ${stamp}, ${stamp}, ${stamp}), ('g2', 'Guild Two', 'o2', ${stamp}, ${stamp}, ${stamp})`,
      );
      // Also lose two tables and an index (their children are not referenced), and grow extras.
      await env.exec('DROP TABLE adventure_choices');
      await env.exec('DROP TABLE waifu_card_serials');
      const index =
        dialect === 'sqlite'
          ? 'idx_command_settings_guild_cmd'
          : 'idx_pg_command_settings_guild_cmd';
      await env.exec(`DROP INDEX ${index}`);
      await env.exec('CREATE TABLE legacy_things (id integer)');

      const touched = [
        'guild_welcomer',
        'guild_farewell',
        'free_game_channels',
        'guild_settings',
        'guilds',
      ];
      const before = new Map<string, Record<string, unknown>[]>();
      for (const table of touched) {
        before.set(table, await env.rows(`SELECT * FROM ${table} ORDER BY 1`));
      }
      expect(before.get('guilds')).toHaveLength(2);
      const unchanged = columnNames(await env.liveShape());

      const dry = await migrateDatabase(env.client, {
        migrations: baselinePlusExtra,
        dryRun: true,
      });
      expect(dry.applied).toEqual([extra.id]);
      expect(dry.adoption!.addedColumns).toHaveLength(13);
      expect(await env.tables()).not.toContain(MIGRATIONS_TABLE);
      expect(columnNames(await env.liveShape())).toEqual(unchanged);

      const { log, infos, warnings } = recorder();
      const result = await migrateDatabase(env.client, { migrations: [baseline], log });

      expect(result.applied).toEqual([]);
      expect(result.adoption).toEqual(dry.adoption);
      expect([...result.adoption!.createdTables].sort()).toEqual([
        'adventure_choices',
        'waifu_card_serials',
      ]);
      expect(result.adoption!.createdIndexes).toEqual([index]);
      expect(result.adoption!.notes).toEqual([
        'Extra table "legacy_things" is not in the baseline; kept',
      ]);
      expect(warnings).toEqual(result.adoption!.notes);
      expect([...result.adoption!.addedColumns].sort()).toEqual(
        [
          'free_game_channels.mention_role_id',
          'guild_farewell.background_file',
          'guild_settings.tcg_drop_channel_id',
          'guild_settings.tcg_drop_claim_timeout_seconds',
          'guild_settings.tcg_drop_cooldown_minutes',
          'guild_settings.tcg_drop_end_hour',
          'guild_settings.tcg_drop_message_threshold',
          'guild_settings.tcg_drop_start_hour',
          'guild_settings.tcg_drops_enabled',
          'guild_settings.tcg_manager_role_id',
          'guild_welcomer.background_file',
          'guilds.invited_by_id',
          'guilds.invited_via',
        ].sort(),
      );
      expect(infos.some((message) => message.includes('Adopted the existing database'))).toBe(true);

      // Every old row is intact, column for column.
      for (const table of touched) {
        const old = before.get(table)!;
        const columns = Object.keys(old[0]!).join(', ');
        expect(await env.rows(`SELECT ${columns} FROM ${table} ORDER BY 1`)).toEqual(old);
      }
      // The new columns hold the baseline's defaults.
      expect(
        await env.rows(
          'SELECT tcg_drop_message_threshold AS threshold, tcg_manager_role_id AS role FROM guild_settings ORDER BY guild_id',
        ),
      ).toEqual([
        { threshold: 50, role: null },
        { threshold: 50, role: null },
      ]);
      expect(await env.rows('SELECT invited_by_id AS who FROM guilds ORDER BY id')).toEqual([
        { who: null },
        { who: null },
      ]);
      // It ends with exactly the baseline's columns (plus the extra table) and its indexes.
      const live = await env.liveShape();
      const wanted = await env.baselineShape();
      const ended = columnNames(live);
      delete ended.legacy_things;
      expect(ended).toEqual(columnNames(wanted));
      for (const [name, columns] of live.tables) {
        for (const [column, shaped] of columns) {
          const expectedColumn = wanted.tables.get(name)?.get(column);
          if (expectedColumn) expect(shaped.type).toBe(expectedColumn.type);
        }
      }
      for (const wantedIndex of wanted.indexes.keys())
        expect(live.indexes.has(wantedIndex)).toBe(true);
      if (dialect === 'postgres') {
        const constraint = await env.rows(
          `SELECT conname FROM pg_constraint WHERE conrelid = 'adventure_choices'::regclass AND conname = 'adventure_choices_session_id_adventure_sessions_id_fk'`,
        );
        expect(constraint).toHaveLength(1);
      }
    });

    // --- A small baseline -----------------------------------------------------------------

    it('creates missing tables and indexes and adds a missing nullable and a defaulted column', async () => {
      await miniDatabase(
        'DROP INDEX uq_mini_guilds_name',
        'DROP INDEX idx_user_cards_serial_unique',
        'DROP TABLE user_cards',
        'DROP TABLE mini_logs',
        'ALTER TABLE mini_guilds DROP COLUMN note',
        'ALTER TABLE mini_guilds DROP COLUMN score',
        "INSERT INTO mini_guilds (id, name) VALUES ('g1', 'One')",
      );

      const result = await migrateDatabase(env.client, { migrations: [mini] });

      expect(result.adoption).toEqual({
        createdTables: ['user_cards', 'mini_logs'],
        addedColumns: ['mini_guilds.score', 'mini_guilds.note'],
        createdIndexes: ['uq_mini_guilds_name', 'idx_user_cards_serial_unique'],
        notes: [],
      });
      expect(columnNames(await env.liveShape())).toEqual(
        columnNames(sqliteBaselineShape(MINI_STATEMENTS)),
      );
      expect(await env.rows('SELECT id, name, score, note FROM mini_guilds')).toEqual([
        { id: 'g1', name: 'One', score: 0, note: null },
      ]);
    });

    it('logs extra tables and columns and differing nullability, and keeps them', async () => {
      await miniDatabase(
        'CREATE TABLE legacy_things (id integer)',
        'ALTER TABLE mini_guilds ADD COLUMN legacy_note text',
      );
      const { log, warnings } = recorder();

      const result = await migrateDatabase(env.client, { migrations: [mini], log });

      expect(result.adoption!.notes).toEqual([
        'Extra column "mini_guilds.legacy_note" is not in the baseline; kept',
        'Extra table "legacy_things" is not in the baseline; kept',
      ]);
      expect(warnings).toEqual(result.adoption!.notes);
      expect(await env.tables()).toContain('legacy_things');
      expect((await env.liveShape()).tables.get('mini_guilds')!.has('legacy_note')).toBe(true);
    });

    it('refuses a missing NOT NULL column without a default and a changed type, with one report', async () => {
      await miniDatabase('DROP INDEX uq_mini_guilds_name', 'DROP TABLE mini_guilds');
      await env.exec('CREATE TABLE mini_guilds (id text PRIMARY KEY NOT NULL, score text)');
      const before = columnNames(await env.liveShape());

      for (const dryRun of [false, true]) {
        const failure = await migrateDatabase(env.client, {
          migrations: [mini, extra],
          dryRun,
        }).catch((error: unknown) => error as Error);
        expect(failure).toBeInstanceOf(Error);
        const message = (failure as Error).message;
        expect(message).toContain('cannot be adopted. Nothing was changed.');
        expect(message).toContain(
          '"mini_guilds.name" is missing and is NOT NULL without a default',
        );
        expect(message).toMatch(/"mini_guilds.score" is text but the baseline has integer/i);
      }

      expect(await env.tables()).not.toContain(MIGRATIONS_TABLE);
      expect(await env.tables()).not.toContain('adoption_extra');
      expect(columnNames(await env.liveShape())).toEqual(before);
    });

    it('refuses duplicate owned-card serials and changes nothing', async () => {
      await miniDatabase(
        'DROP INDEX idx_user_cards_serial_unique',
        "INSERT INTO user_cards (id, card_id, serial_number) VALUES ('one', 'card_a', 1)",
        "INSERT INTO user_cards (id, card_id, serial_number) VALUES ('two', 'card_a', 1)",
        'ALTER TABLE mini_guilds DROP COLUMN note',
      );

      await expect(migrateDatabase(env.client, { migrations: [mini] })).rejects.toThrow(
        DUPLICATE_SERIALS_MESSAGE,
      );
      expect(await env.tables()).not.toContain(MIGRATIONS_TABLE);
      expect((await env.liveShape()).tables.get('mini_guilds')!.has('note')).toBe(false);
      expect(Number((await env.rows('SELECT count(*) AS n FROM user_cards'))[0]!.n)).toBe(2);
    });

    it('rolls the whole adoption back when a statement fails', async () => {
      // The unique index on the name cannot be created over duplicate names, after the column
      // and the table were added.
      await miniDatabase(
        'DROP INDEX uq_mini_guilds_name',
        'DROP TABLE mini_logs',
        'ALTER TABLE mini_guilds DROP COLUMN note',
        "INSERT INTO mini_guilds (id, name) VALUES ('a', 'DUP')",
        "INSERT INTO mini_guilds (id, name) VALUES ('b', 'DUP')",
      );
      const before = columnNames(await env.liveShape());

      const failure = await migrateDatabase(env.client, { migrations: [mini] }).catch(
        (error: unknown) => error as Error,
      );

      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toContain('failed and was rolled back');
      expect(await env.tables()).not.toContain(MIGRATIONS_TABLE);
      expect(columnNames(await env.liveShape())).toEqual(before);
    });
  });
});

describe.skipIf(!postgresUrl)('adoption [postgres] specifics', () => {
  let env: Env;
  beforeEach(async () => {
    env = await postgresEnv();
  });
  afterEach(async () => {
    await env.dispose();
  });

  // economy_items.id is one of TEXT_ID_COLUMNS, which was uuid before BUG-0038.
  const itemsBaseline = migration('0000_baseline', [
    'CREATE TABLE "economy_items" ("id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL, "name" text NOT NULL);',
  ]);

  it('turns uuid id columns into text before it compares, and a dry run leaves them alone', async () => {
    await env.exec(
      'CREATE TABLE economy_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, name text NOT NULL)',
    );
    const id = '0b5e5c0e-6d0e-4a8f-9d6b-0c1f2d3e4a5b';
    await env.exec(`INSERT INTO economy_items (id, name) VALUES ('${id}', 'Potion')`);
    const type = async () => (await env.liveShape()).tables.get('economy_items')!.get('id')!.type;

    const dry = await migrateDatabase(env.client, { migrations: [itemsBaseline], dryRun: true });
    expect(dry.adoption!.addedColumns).toEqual([]);
    expect(await type()).toBe('uuid');

    await migrateDatabase(env.client, { migrations: [itemsBaseline] });
    expect(await type()).toBe('text');
    expect(await env.rows('SELECT id FROM economy_items')).toEqual([{ id }]);
    const defaults = await env.rows(
      `SELECT pg_get_expr(d.adbin, d.adrelid) AS expr FROM pg_attrdef d
         JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
        WHERE d.adrelid = 'economy_items'::regclass AND a.attname = 'id'`,
    );
    expect(String(defaults[0]!.expr)).toContain('gen_random_uuid()');
  });

  it('refuses a uuid column that is not one of the repaired id columns', async () => {
    await env.exec('CREATE TABLE economy_items (id text PRIMARY KEY NOT NULL, name uuid NOT NULL)');

    await expect(migrateDatabase(env.client, { migrations: [itemsBaseline] })).rejects.toThrow(
      /"economy_items.name" is uuid but the baseline has text/,
    );
    expect(await env.tables()).toEqual(['economy_items']);
  });

  it('adopts once when two processes start together', async () => {
    for (const statement of MINI_STATEMENTS) await env.exec(statement);
    const other = await env.open!();
    const migrations = [mini, extra];

    const results = await Promise.all([
      migrateDatabase(env.client, { migrations }),
      migrateDatabase(other, { migrations }),
    ]);

    expect(results.filter((result) => result.adoption !== null)).toHaveLength(1);
    expect([...results[0]!.applied, ...results[1]!.applied]).toEqual([extra.id]);
    expect(
      (await env.rows(`SELECT id, adopted FROM ${MIGRATIONS_TABLE} ORDER BY id`)).map((row) => [
        row.id,
        row.adopted,
      ]),
    ).toEqual([
      [mini.id, true],
      [extra.id, false],
    ]);
  });
});

describe('adoption [sqlite] backup', () => {
  let directory: string;
  let client: DatabaseClient;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'ririko-adopt-'));
    client = await createDatabaseClient({
      dialect: 'sqlite',
      url: join(directory, 'ririko.sqlite'),
      autoMigrate: false,
    });
  });
  afterEach(async () => {
    await client.close();
    rmSync(directory, { recursive: true, force: true });
  });

  const backups = () => {
    const folder = join(directory, 'backups');
    return existsSync(folder) ? readdirSync(folder) : [];
  };

  it('backs the file up before it adopts, and not when the adoption is refused', async () => {
    if (client.dialect !== 'sqlite') throw new Error('expected SQLite');
    client.raw.exec(SQLITE_SCHEMA_DDL);
    client.raw.exec('ALTER TABLE guilds DROP COLUMN invited_by_id');
    client.raw.exec('ALTER TABLE guilds DROP COLUMN name');

    await expect(migrateDatabase(client, { migrations: [baselineOf('sqlite')] })).rejects.toThrow(
      /Nothing was changed/,
    );
    expect(backups()).toEqual([]);

    client.raw.exec("ALTER TABLE guilds ADD COLUMN name text NOT NULL DEFAULT 'x'");
    const result = await migrateDatabase(client, { migrations: [baselineOf('sqlite')] });

    expect(result.adoption!.addedColumns).toEqual(['guilds.invited_by_id']);
    expect(result.backupPath).not.toBeNull();
    expect(backups()).toHaveLength(1);
    const copy = new DatabaseConstructor(result.backupPath!, { readonly: true });
    const columns = (copy.prepare('PRAGMA table_info(guilds)').all() as { name: string }[]).map(
      (column) => column.name,
    );
    copy.close();
    expect(columns).not.toContain('invited_by_id');
    expect(columns).toContain('name');
  });
});

/**
 * What `ensureAdventureSchema` ran on both dialects before ADR-015 (removed in TASK-1854;
 * `packages/database/src/migrations/adventure-schema.ts` at commit 8ffd7a6). On SQLite it left
 * BIGINT and BOOLEAN columns where the baseline declares INTEGER.
 */
const OLD_ADVENTURE_DDL = [
  `CREATE TABLE IF NOT EXISTS adventure_settings (
    guild_id TEXT PRIMARY KEY NOT NULL, energy_enabled BOOLEAN NOT NULL DEFAULT TRUE
  )`,
  `CREATE TABLE IF NOT EXISTS adventure_players (
    user_id TEXT PRIMARY KEY NOT NULL, cooldown_until BIGINT NOT NULL DEFAULT 0, last_start_at BIGINT NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS adventure_sessions (
    id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL, revision INTEGER NOT NULL, delivered_revision INTEGER NOT NULL DEFAULT -1, status TEXT NOT NULL,
    deadline BIGINT NOT NULL, created_at BIGINT NOT NULL, payload TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_adventure_active_user ON adventure_sessions(user_id)
    WHERE status IN ('ACTIVE', 'SETTLING')`,
  `CREATE INDEX IF NOT EXISTS idx_adventure_due ON adventure_sessions(status, deadline)`,
  `CREATE INDEX IF NOT EXISTS idx_adventure_user_created ON adventure_sessions(user_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS adventure_choices (
    session_id TEXT NOT NULL REFERENCES adventure_sessions(id), revision INTEGER NOT NULL,
    payload TEXT NOT NULL, PRIMARY KEY(session_id, revision)
  )`,
];

describe('adoption [sqlite] adventure tables the old upgrade created as BIGINT and BOOLEAN', () => {
  let env: Env;
  const baseline = baselineOf('sqlite');
  const rowsOf = async (name: string) =>
    (await env.rows(`SELECT * FROM ${name} ORDER BY 1, 2`)).map((row) => ({ ...row }));

  beforeEach(async () => {
    env = await sqliteEnv();
    await env.exec(SQLITE_SCHEMA_DDL);
    for (const name of [
      'adventure_choices',
      'adventure_sessions',
      'adventure_players',
      'adventure_settings',
    ]) {
      await env.exec(`DROP TABLE ${name}`);
    }
    for (const statement of OLD_ADVENTURE_DDL) await env.exec(statement);
    await env.exec(
      `INSERT INTO adventure_settings (guild_id, energy_enabled) VALUES ('g1', TRUE), ('g2', FALSE)`,
    );
    await env.exec(
      `INSERT INTO adventure_players (user_id, cooldown_until, last_start_at) VALUES ('u1', 1760000000000, 1759999999000), ('u2', 0, 0)`,
    );
    await env.exec(
      `INSERT INTO adventure_sessions (id, user_id, guild_id, channel_id, revision, delivered_revision, status, deadline, created_at, payload)
       VALUES ('s1', 'u1', 'g1', 'c1', 3, 2, 'ACTIVE', 1760000600000, 1760000000000, '{"a":1}'),
              ('s2', 'u2', 'g1', 'c1', 1, -1, 'DONE', 1750000600000, 1750000000000, '{}')`,
    );
    await env.exec(
      `INSERT INTO adventure_choices (session_id, revision, payload) VALUES ('s1', 1, 'x'), ('s1', 2, 'y')`,
    );
  });
  afterEach(async () => {
    await env.dispose();
  });

  it('adopts the database, keeps every row and column, and reports the notes on a dry run', async () => {
    const before = {
      settings: await rowsOf('adventure_settings'),
      players: await rowsOf('adventure_players'),
      sessions: await rowsOf('adventure_sessions'),
      choices: await rowsOf('adventure_choices'),
    };
    const columns = columnNames(await env.liveShape());
    const notes = [
      '"adventure_settings.energy_enabled" is BOOLEAN, the baseline has INTEGER (NUMERIC and INTEGER affinity both store whole numbers as INTEGER); left as it is',
      '"adventure_players.last_start_at" is BIGINT, the baseline has INTEGER (same SQLite affinity); left as it is',
      '"adventure_players.cooldown_until" is BIGINT, the baseline has INTEGER (same SQLite affinity); left as it is',
      '"adventure_sessions.deadline" is BIGINT, the baseline has INTEGER (same SQLite affinity); left as it is',
      '"adventure_sessions.created_at" is BIGINT, the baseline has INTEGER (same SQLite affinity); left as it is',
    ].sort();

    const dry = await migrateDatabase(env.client, { migrations: [baseline], dryRun: true });
    expect([...dry.adoption!.notes].sort()).toEqual(notes);
    expect(dry.adoption!.createdTables).toEqual([]);
    expect(dry.adoption!.addedColumns).toEqual([]);
    expect(await env.tables()).not.toContain(MIGRATIONS_TABLE);

    const result = await migrateDatabase(env.client, { migrations: [baseline] });
    expect([...result.adoption!.notes].sort()).toEqual(notes);
    const recorded = await env.rows(`SELECT id, checksum, adopted FROM ${MIGRATIONS_TABLE}`);
    expect(recorded.map((row) => [row.id, row.checksum, Boolean(row.adopted)])).toEqual([
      [baseline.id, baseline.checksum, true],
    ]);

    expect(await rowsOf('adventure_settings')).toEqual(before.settings);
    expect(await rowsOf('adventure_players')).toEqual(before.players);
    expect(await rowsOf('adventure_sessions')).toEqual(before.sessions);
    expect(await rowsOf('adventure_choices')).toEqual(before.choices);
    const after = columnNames(await env.liveShape());
    expect(after).toEqual(columns);
    const live = (await env.liveShape()).tables;
    expect(live.get('adventure_sessions')!.get('deadline')!.type).toBe('BIGINT');
    expect(live.get('adventure_settings')!.get('energy_enabled')!.type).toBe('BOOLEAN');

    expect((await migrateDatabase(env.client, { migrations: [baseline] })).adoption).toBeNull();
  });

  it('still refuses an adventure column whose type has another affinity', async () => {
    await env.exec('ALTER TABLE adventure_players DROP COLUMN last_start_at');
    await env.exec(
      `ALTER TABLE adventure_players ADD COLUMN last_start_at TEXT NOT NULL DEFAULT '0'`,
    );
    const failure = await migrateDatabase(env.client, { migrations: [baseline] }).catch(
      (error: unknown) => error as Error,
    );
    const message = (failure as Error).message;
    expect(message).toContain(
      '"adventure_players.last_start_at" is TEXT but the baseline has INTEGER',
    );
    expect(message).not.toContain('cooldown_until');
    expect(await env.tables()).not.toContain(MIGRATIONS_TABLE);
  });
});
