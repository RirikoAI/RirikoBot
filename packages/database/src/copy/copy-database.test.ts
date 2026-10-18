import DatabaseConstructor from 'better-sqlite3';
import type Database from 'better-sqlite3';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS_TABLE } from '../migrations/runner.js';
import { SQLITE_SCHEMA_DDL } from '../schema/sqlite/ddl.js';
import { FakePostgres, type FakeTableSpec } from '../testing/fake-postgres.js';
import {
  buildCopyPlan,
  buildInsert,
  converterFor,
  copyIntoConnection,
  orderTablesByForeignKeys,
  quoteIdent,
  readSourceTables,
  sqliteTimestampUnits,
  type SourceTable,
  type TargetColumn,
} from './copy-database.js';

function openSource(): Database.Database {
  const db = new (DatabaseConstructor as unknown as typeof Database)(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(SQLITE_SCHEMA_DDL);
  return db;
}

const column = (overrides: Partial<TargetColumn> & { name: string }): TargetColumn => ({
  table: 't',
  dataType: 'text',
  nullable: false,
  hasDefault: false,
  identity: null,
  generated: false,
  sequenced: false,
  ...overrides,
});

const COUNTER_TABLE: FakeTableSpec = {
  name: 'counter_items',
  columns: [
    { name: 'id', dataType: 'integer', nullable: false, identity: 'ALWAYS' },
    { name: 'label', dataType: 'text' },
  ],
};

describe('converterFor', () => {
  const run = (type: string, value: unknown, unit?: 'seconds' | 'milliseconds') =>
    converterFor(type, unit)!(value);

  it('turns 0 and 1 into booleans and refuses anything else', () => {
    expect(run('boolean', 1n)).toBe(true);
    expect(run('boolean', 0n)).toBe(false);
    expect(run('boolean', 1)).toBe(true);
    expect(run('boolean', '0')).toBe(false);
    expect(run('boolean', 'TRUE')).toBe(true);
    expect(run('boolean', false)).toBe(false);
    expect(() => run('boolean', 7n)).toThrow('expected a boolean stored as 0 or 1, found bigint 7');
    expect(() => run('boolean', 'maybe')).toThrow(/found text "maybe"/);
  });

  it('keeps integers exact as decimal text, including values above 2^53', () => {
    expect(run('bigint', 9007199254740993n)).toBe('9007199254740993');
    expect(run('integer', 42)).toBe('42');
    expect(run('smallint', '-7')).toBe('-7');
    expect(() => run('integer', 1.5)).toThrow('expected an integer');
    expect(() => run('integer', 'abc')).toThrow('expected an integer');
    expect(() => run('bigint', new Uint8Array([1]))).toThrow('found binary data');
  });

  it('passes numeric values without float rounding', () => {
    expect(run('numeric', 123456789012345678901234567890n)).toBe('123456789012345678901234567890');
    expect(run('numeric', 12.5)).toBe('12.5');
    expect(run('numeric', '1.5e3')).toBe('1.5e3');
    expect(() => run('numeric', Number.NaN)).toThrow('expected a number');
  });

  it('converts floats', () => {
    expect(run('real', 0.25)).toBe(0.25);
    expect(run('double precision', 3n)).toBe(3);
    expect(run('real', '2.5')).toBe(2.5);
    expect(() => run('real', 'fast')).toThrow('expected a number');
  });

  it('passes text, uuid and JSON text as they are and decodes blobs of text', () => {
    expect(run('character varying', 'abc')).toBe('abc');
    expect(run('uuid', '00000000-0000-4000-8000-000000000001')).toBe(
      '00000000-0000-4000-8000-000000000001',
    );
    expect(run('jsonb', '{"a":1}')).toBe('{"a":1}');
    expect(run('json', Buffer.from('[1]'))).toBe('[1]');
    expect(run('text', 12n)).toBe('12');
    expect(run('character', 5)).toBe('5');
    expect(() => run('text', {})).toThrow('expected text');
  });

  it('copies blobs as Buffers', () => {
    const bytes = run('bytea', new Uint8Array([1, 2, 3])) as Buffer;
    expect(Buffer.isBuffer(bytes)).toBe(true);
    expect([...bytes]).toEqual([1, 2, 3]);
    expect(() => run('bytea', 'text')).toThrow('expected binary data');
  });

  it('reads timestamps by the unit the SQLite schema uses', () => {
    expect(run('timestamp with time zone', 1_700_000_000n, 'seconds')).toBe(
      '2023-11-14T22:13:20.000Z',
    );
    expect(run('timestamp with time zone', 1_700_000_000_123n, 'milliseconds')).toBe(
      '2023-11-14T22:13:20.123Z',
    );
    expect(run('timestamp without time zone', 1_700_000_000_000, 'milliseconds')).toBe(
      '2023-11-14T22:13:20.000Z',
    );
    expect(run('timestamp with time zone', '1700000000', 'seconds')).toBe(
      '2023-11-14T22:13:20.000Z',
    );
    expect(() => run('timestamp with time zone', 'yesterday', 'seconds')).toThrow(
      'expected an epoch number',
    );
    expect(() => run('timestamp with time zone', 1e20, 'milliseconds')).toThrow(
      'expected a valid epoch timestamp',
    );
  });

  it('turns null into null for every type and refuses unknown types', () => {
    for (const type of ['boolean', 'bigint', 'numeric', 'real', 'text', 'bytea', 'jsonb']) {
      expect(run(type, null)).toBeNull();
      expect(run(type, undefined)).toBeNull();
    }
    expect(run('timestamp with time zone', null, 'seconds')).toBeNull();
    expect(converterFor('timestamp with time zone', undefined)).toBeNull();
    expect(converterFor('interval', undefined)).toBeNull();
    expect(converterFor('date', undefined)).toBeNull();
  });
});

describe('sqliteTimestampUnits', () => {
  it('reads the unit of every Drizzle timestamp column', () => {
    const units = sqliteTimestampUnits();
    expect(units.get('economy_accounts.created_at')).toBe('milliseconds');
    expect(units.has('economy_balances.wallet_balance')).toBe(false);
    expect(units.has('adventure_sessions.created_at')).toBe(false);
  });

  it('tells seconds from milliseconds', () => {
    const table = sqliteTable('sample', {
      id: text('id').primaryKey(),
      a: integer('a', { mode: 'timestamp' }),
      b: integer('b', { mode: 'timestamp_ms' }),
      c: integer('c'),
    });
    const units = sqliteTimestampUnits({ table, ignored: 'not a table' });
    expect(units.get('sample.a')).toBe('seconds');
    expect(units.get('sample.b')).toBe('milliseconds');
    expect(units.has('sample.c')).toBe(false);
  });
});

describe('orderTablesByForeignKeys', () => {
  it('puts parents before children and keeps unrelated tables in name order', () => {
    const order = orderTablesByForeignKeys(
      ['c', 'b', 'a', 'z'],
      [
        { child: 'a', parent: 'b' },
        { child: 'b', parent: 'c' },
      ],
    );
    expect(order).toEqual(['c', 'z', 'b', 'a']);
  });

  it('ignores self references and tables outside the copy', () => {
    expect(
      orderTablesByForeignKeys(
        ['a', 'b'],
        [
          { child: 'a', parent: 'a' },
          { child: 'a', parent: 'elsewhere' },
          { child: 'elsewhere', parent: 'b' },
        ],
      ),
    ).toEqual(['a', 'b']);
  });

  it('names the tables of a cycle', () => {
    expect(() =>
      orderTablesByForeignKeys(
        ['a', 'b', 'c', 'free'],
        [
          { child: 'a', parent: 'b' },
          { child: 'b', parent: 'a' },
          { child: 'c', parent: 'a' },
        ],
      ),
    ).toThrow('form a cycle between these tables: a, b, c.');
  });
});

describe('buildInsert', () => {
  it('numbers parameters across rows and quotes identifiers', () => {
    expect(buildInsert('my"table', ['a', 'b'], 2, false)).toBe(
      'INSERT INTO "my""table" ("a", "b") VALUES ($1, $2), ($3, $4)',
    );
    expect(buildInsert('t', ['id'], 1, true)).toBe(
      'INSERT INTO "t" ("id") OVERRIDING SYSTEM VALUE VALUES ($1)',
    );
    expect(quoteIdent('plain')).toBe('"plain"');
  });
});

describe('buildCopyPlan', () => {
  const units = new Map<string, 'seconds' | 'milliseconds'>();
  const plan = (
    sourceTables: SourceTable[],
    targetColumns: TargetColumn[],
    foreignKeys: { child: string; parent: string }[] = [],
  ) => buildCopyPlan({ sourceTables, targetColumns, foreignKeys, timestampUnits: units });

  it('plans every table of the real PostgreSQL schema against the real SQLite schema', async () => {
    // Every column type and every timestamp unit in the 2.0 schema must be convertible.
    const fake = new FakePostgres();
    const source = openSource();
    const sourceTables = readSourceTables(source);
    const { rows } = await fake.query('SELECT information_schema.columns');
    const targetColumns: TargetColumn[] = rows.map((row) => ({
      table: String(row.table_name),
      name: String(row.column_name),
      dataType: String(row.data_type),
      nullable: row.is_nullable === 'YES',
      hasDefault: row.column_default !== null,
      identity: null,
      generated: false,
      sequenced: false,
    }));

    const result = buildCopyPlan({
      sourceTables,
      targetColumns,
      foreignKeys: [{ child: 'adventure_choices', parent: 'adventure_sessions' }],
      timestampUnits: sqliteTimestampUnits(),
    });
    source.close();

    expect(result.tables).toHaveLength(sourceTables.length);
    expect(result.warnings).toEqual([]);
    const names = result.tables.map((table) => table.name);
    expect(names.indexOf('adventure_sessions')).toBeLessThan(names.indexOf('adventure_choices'));
    expect(names).toContain('waifu_card_serials');
  });

  it('refuses a source table the target lacks, a source column the target lacks and a generated column', () => {
    let message = '';
    try {
      plan(
        [
          { name: 'ghost', columns: ['id'] },
          { name: 't', columns: ['a', 'extra', 'computed'] },
        ],
        [column({ name: 'a' }), column({ name: 'computed', generated: true, hasDefault: true })],
      );
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('Nothing was written.');
    expect(message).toContain('Source table "ghost" has no table in the target.');
    expect(message).toContain('Source column "t.extra" has no column in the target.');
    expect(message).toContain('Source column "t.computed" has no column in the target.');
  });

  it('allows target columns the source lacks only when they are nullable or defaulted', () => {
    const planned = plan(
      [{ name: 't', columns: ['a'] }],
      [
        column({ name: 'a' }),
        column({ name: 'maybe', nullable: true }),
        column({ name: 'defaulted', hasDefault: true }),
      ],
    );
    expect(planned.warnings).toEqual([
      'Target column t.maybe is not in the source; it gets NULL.',
      'Target column t.defaulted is not in the source; it gets its default.',
    ]);

    expect(() =>
      plan([{ name: 't', columns: ['a'] }], [column({ name: 'a' }), column({ name: 'required' })]),
    ).toThrow(
      'Target column "t.required" is required (NOT NULL, no default) but the source lacks it.',
    );
  });

  it('names the table and column of an unknown type or an unknown timestamp unit', () => {
    expect(() =>
      plan([{ name: 't', columns: ['when'] }], [column({ name: 'when', dataType: 'interval' })]),
    ).toThrow('Column t.when has the unsupported type "interval".');
    expect(() =>
      plan(
        [{ name: 't', columns: ['at'] }],
        [column({ name: 'at', dataType: 'timestamp with time zone' })],
      ),
    ).toThrow(/Column t\.at is a timestamp with time zone but the SQLite schema does not store/);
  });

  it('overrides identity values only for GENERATED ALWAYS columns the source fills', () => {
    const always = plan(
      [{ name: 't', columns: ['id'] }],
      [column({ name: 'id', dataType: 'integer', identity: 'ALWAYS', hasDefault: true })],
    );
    expect(always.tables[0]!.overridingSystemValue).toBe(true);
    const byDefault = plan(
      [{ name: 't', columns: ['id'] }],
      [column({ name: 'id', dataType: 'integer', identity: 'BY DEFAULT', hasDefault: true })],
    );
    expect(byDefault.tables[0]!.overridingSystemValue).toBe(false);
  });
});

describe('copyIntoConnection', () => {
  function seed(source: Database.Database): void {
    const insertUser = source.prepare(
      'INSERT INTO users (id, username, is_blacklisted, warn_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    );
    insertUser.run('u1', 'alice', 0, 2, 1_700_000_000_123, 1_700_000_000_456);
    insertUser.run('u2', 'bob', 1, 0, 1_700_000_001_000, 1_700_000_002_000);
    insertUser.run('u3', 'cara', 0, 0, 1_700_000_003_000, 1_700_000_004_000);

    const insertBalance = source.prepare(
      'INSERT INTO economy_balances (user_id, wallet_balance, bank_balance, bank_capacity, net_worth, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    );
    // Above 2^53: a float would round this to ...992.
    insertBalance.run('u1', 9_007_199_254_740_993n, 5n, 10_000n, 0n, 1_700_000_000_000);
    insertBalance.run('u2', 100n, 9_007_199_254_740_999n, 10_000n, 0n, 1_700_000_000_000);

    source
      .prepare(
        `INSERT INTO guild_settings (guild_id, escalation_steps, no_xp_channel_ids, voice_xp_enabled, created_at, updated_at)
         VALUES ('g1', '[{"warnings":3,"action":"MUTE"}]', '["c1","c2"]', 1, 1700000000000, 1700000000000)`,
      )
      .run();

    // The child table `adventure_choices` sorts before `adventure_sessions`; the engine must still
    // insert the session first, because of the foreign key.
    source
      .prepare(
        `INSERT INTO adventure_sessions (id, user_id, guild_id, channel_id, revision, status, deadline, created_at, payload)
         VALUES ('s1', 'u1', 'g1', 'c1', 1, 'ACTIVE', 9007199254740993, 1700000000000, '{"id":"s1"}')`,
      )
      .run();
    source
      .prepare(
        `INSERT INTO adventure_choices (session_id, revision, payload) VALUES ('s1', 1, '{"choice":"left"}')`,
      )
      .run();
    source
      .prepare('INSERT INTO adventure_settings (guild_id, energy_enabled) VALUES (?, ?)')
      .run('g1', 0);

    source.exec('CREATE TABLE counter_items (id INTEGER, label TEXT)');
    source.exec("INSERT INTO counter_items VALUES (1, 'a'), (3, 'c'), (2, 'b')");
  }

  const tableNames = (report: { tables: { name: string }[] }) => report.tables.map((t) => t.name);

  it('copies every table with converted values, in foreign key order, and verifies the result', async () => {
    const source = openSource();
    seed(source);
    const fake = new FakePostgres({ extraTables: [COUNTER_TABLE] });

    const report = await copyIntoConnection(source, fake);
    source.close();

    // Every base table is copied, empty ones included.
    expect(report.tables.length).toBeGreaterThan(90);
    const users = report.tables.find((table) => table.name === 'users');
    expect(users).toEqual({ name: 'users', sourceRows: 3, targetRows: 3 });
    expect(report.tables.every((table) => table.sourceRows === table.targetRows)).toBe(true);
    const order = tableNames(report);
    expect(order.indexOf('adventure_sessions')).toBeLessThan(order.indexOf('adventure_choices'));

    const [alice, bob] = fake.objectsOf('users');
    expect(alice).toMatchObject({
      id: 'u1',
      is_blacklisted: false,
      warn_count: '2',
      created_at: '2023-11-14T22:13:20.123Z',
      updated_at: '2023-11-14T22:13:20.456Z',
    });
    expect(bob).toMatchObject({ is_blacklisted: true });

    const [balance] = fake.objectsOf('economy_balances');
    expect(balance).toMatchObject({
      wallet_balance: '9007199254740993',
      bank_balance: '5',
      bank_capacity: '10000',
    });

    const [settings] = fake.objectsOf('guild_settings');
    expect(settings).toMatchObject({
      escalation_steps: '[{"warnings":3,"action":"MUTE"}]',
      no_xp_channel_ids: '["c1","c2"]',
      voice_xp_enabled: true,
    });
    expect(fake.objectsOf('adventure_sessions')[0]).toMatchObject({
      deadline: '9007199254740993',
      created_at: '1700000000000',
    });
    expect(fake.objectsOf('adventure_settings')[0]).toMatchObject({ energy_enabled: false });

    expect(report.coinsChecked).toBe(true);
    expect(report.coinTotals).toEqual({
      wallet: '9007199254741093',
      bank: '9007199254741004',
    });
  });

  it('moves identity sequences to the highest copied value and overrides GENERATED ALWAYS ids', async () => {
    const source = openSource();
    seed(source);
    const fake = new FakePostgres({ extraTables: [COUNTER_TABLE] });

    const report = await copyIntoConnection(source, fake);
    source.close();

    expect(report.sequences).toEqual([{ table: 'counter_items', column: 'id', value: '3' }]);
    expect(fake.sequenceResets).toEqual([{ name: 'seq_id', value: '3' }]);
    const insert = fake.inserts.find((entry) => entry.table === 'counter_items')!;
    expect(insert.overridingSystemValue).toBe(true);
    expect(
      fake.statements.find((text) => text.startsWith('INSERT INTO "counter_items"')),
    ).toContain('OVERRIDING SYSTEM VALUE');
  });

  it('warns and goes on when a sequence cannot be found, and skips sequences of empty tables', async () => {
    const source = openSource();
    seed(source);
    const fake = new FakePostgres({
      extraTables: [
        COUNTER_TABLE,
        {
          name: 'untouched',
          columns: [{ name: 'id', dataType: 'integer', nullable: false, sequenced: true }],
        },
      ],
      noSequence: true,
    });
    source.exec('CREATE TABLE untouched (id INTEGER)');

    const report = await copyIntoConnection(source, fake);
    source.close();

    expect(report.sequences).toEqual([]);
    expect(report.warnings).toEqual(['No sequence found for counter_items.id; it was not reset.']);
    expect(fake.sequenceResets).toEqual([]);
  });

  it('inserts in batches of the requested size', async () => {
    const source = openSource();
    seed(source);
    const fake = new FakePostgres({ extraTables: [COUNTER_TABLE] });

    await copyIntoConnection(source, fake, { batchSize: 2 });
    source.close();

    const userInserts = fake.inserts.filter((entry) => entry.table === 'users');
    expect(userInserts.map((entry) => entry.rows.length)).toEqual([2, 1]);
    expect(fake.rowsOf('users')).toHaveLength(3);
  });

  it('rejects an invalid batch size before touching the target', async () => {
    const source = openSource();
    const fake = new FakePostgres();

    await expect(copyIntoConnection(source, fake, { batchSize: 0 })).rejects.toThrow(
      'The batch size must be a positive integer, got 0.',
    );
    expect(fake.statements).toEqual([]);
    source.close();
  });

  it('skips SQLite internals, Drizzle bookkeeping and the migration tracking table', async () => {
    const source = openSource();
    source.exec('CREATE TABLE __drizzle_migrations (id INTEGER, hash TEXT)');
    source.exec("INSERT INTO __drizzle_migrations VALUES (1, 'abc')");
    // The target keeps its own records of the migrations it ran; the source's are not copied.
    source.exec(`CREATE TABLE ${MIGRATIONS_TABLE} (id TEXT PRIMARY KEY, applied_at INTEGER)`);
    source.exec(`INSERT INTO ${MIGRATIONS_TABLE} VALUES ('0000_baseline', 0)`);
    const fake = new FakePostgres();

    const report = await copyIntoConnection(source, fake);
    source.close();

    expect(tableNames(report)).not.toContain('__drizzle_migrations');
    expect(tableNames(report)).not.toContain(MIGRATIONS_TABLE);
    expect(tableNames(report).some((name) => name.startsWith('sqlite_'))).toBe(false);
    expect(fake.inserts).toEqual([]);
    // An empty economy table still gets the check: zero against zero.
    expect(report.coinTotals).toEqual({ wallet: '0', bank: '0' });
  });

  it('skips the balance check when the source has no economy table', async () => {
    const source = openSource();
    source.exec('DROP TABLE economy_balances');
    const fake = new FakePostgres();

    const report = await copyIntoConnection(source, fake);
    source.close();

    expect(tableNames(report)).not.toContain('economy_balances');
    expect(report.coinsChecked).toBe(false);
    expect(report.coinTotals).toBeNull();
  });

  it('refuses a target that already has rows and writes nothing', async () => {
    const source = openSource();
    seed(source);
    const fake = new FakePostgres({
      extraTables: [COUNTER_TABLE],
      occupied: ['users', 'economy_balances'],
    });

    await expect(copyIntoConnection(source, fake)).rejects.toThrow(
      'The target is not empty (economy_balances, users). Nothing was written.',
    );
    expect(fake.inserts).toEqual([]);
    source.close();
  });

  it('refuses a source table that the target does not have and writes nothing', async () => {
    const source = openSource();
    seed(source);
    source.exec('CREATE TABLE legacy_leftover (id TEXT)');
    const fake = new FakePostgres({ extraTables: [COUNTER_TABLE] });

    await expect(copyIntoConnection(source, fake)).rejects.toThrow(
      'Source table "legacy_leftover" has no table in the target.',
    );
    expect(fake.inserts).toEqual([]);
    expect(fake.statements.some((text) => text.startsWith('SELECT 1 FROM'))).toBe(false);
    source.close();
  });

  it('refuses a source column that the target does not have', async () => {
    const source = openSource();
    source.exec('ALTER TABLE users ADD COLUMN legacy_flag INTEGER');
    const fake = new FakePostgres();

    await expect(copyIntoConnection(source, fake)).rejects.toThrow(
      'Source column "users.legacy_flag" has no column in the target.',
    );
    expect(fake.inserts).toEqual([]);
    source.close();
  });

  it('copies a source that lacks a defaulted or nullable target column and reports it', async () => {
    const source = openSource();
    seed(source);
    source.exec('ALTER TABLE users DROP COLUMN display_name');
    source.exec('ALTER TABLE users DROP COLUMN warn_count');
    const fake = new FakePostgres({ extraTables: [COUNTER_TABLE] });

    const report = await copyIntoConnection(source, fake);
    source.close();

    expect(report.warnings).toEqual([
      'Target column users.display_name is not in the source; it gets NULL.',
      'Target column users.warn_count is not in the source; it gets its default.',
    ]);
    expect(fake.rowsOf('users')).toHaveLength(3);
    expect(fake.inserts.find((entry) => entry.table === 'users')!.columns).not.toContain(
      'warn_count',
    );
  });

  it('names the table, column and source row of a value it cannot convert', async () => {
    const source = openSource();
    seed(source);
    source.exec("UPDATE users SET is_blacklisted = 7 WHERE id = 'u2'");
    const fake = new FakePostgres({ extraTables: [COUNTER_TABLE] });

    await expect(copyIntoConnection(source, fake)).rejects.toThrow(
      /Cannot convert users\.is_blacklisted in source row 2: expected a boolean stored as 0 or 1, found bigint 7/,
    );
    source.close();
  });

  it('wraps a failing insert with the table it was writing', async () => {
    const source = openSource();
    seed(source);
    const fake = new FakePostgres({ extraTables: [COUNTER_TABLE], failInsertInto: 'users' });

    await expect(copyIntoConnection(source, fake)).rejects.toThrow(
      /Inserting into users failed near source row 3: insert into "users" violates a constraint/,
    );
    source.close();
  });

  it('fails when a table has fewer rows in the target than in the source', async () => {
    const source = openSource();
    seed(source);
    const fake = new FakePostgres({ extraTables: [COUNTER_TABLE], loseRowIn: 'users' });

    await expect(copyIntoConnection(source, fake)).rejects.toThrow(
      'Row counts differ after the copy: users (source 3, target 2).',
    );
    source.close();
  });

  it('fails when the wallet and bank totals differ between source and target', async () => {
    const source = openSource();
    seed(source);
    const fake = new FakePostgres({ extraTables: [COUNTER_TABLE], skewBalances: true });

    await expect(copyIntoConnection(source, fake)).rejects.toThrow(
      /Economy balances differ after the copy: source wallet 9007199254741093 and bank 9007199254741004, target wallet 9007199254741094/,
    );
    source.close();
  });
});
