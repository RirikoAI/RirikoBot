import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import DatabaseConstructor from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabaseClient } from '../client/factory.js';
import { withTransaction } from '../transactions/index.js';
import type { DatabaseClient, PostgresDatabaseClient } from '../client/types.js';
import type { EmbeddedMigration } from './embedded.js';
import {
  migrateDatabase,
  migrationStatus,
  MIGRATIONS_TABLE,
  SQLITE_BACKUPS_KEPT,
} from './runner.js';
import { PG_MIGRATIONS } from './generated/pg.js';
import { SQLITE_MIGRATIONS } from './generated/sqlite.js';

/** A migration for the tests; the checksum follows the statements, as the embedder's does. */
function migration(
  id: string,
  statements: string[],
  options: { contract?: boolean } = {},
): EmbeddedMigration {
  return {
    id,
    statements,
    checksum: createHash('sha256').update(statements.join('\n')).digest('hex'),
    contract: options.contract === true,
  };
}

const create = (table: string) => `CREATE TABLE ${table} (id integer PRIMARY KEY NOT NULL)`;
const m1 = migration('0001_first', [create('t_one')]);
const m2 = migration('0002_second', [create('t_two'), 'INSERT INTO t_two (id) VALUES (1)']);
const m3 = migration('0003_third', [create('t_three')]);

/** `count` migrations, each creating one table. */
const steps = (count: number) =>
  Array.from({ length: count }, (_, i) =>
    migration(`${String(i + 1).padStart(4, '0')}_step`, [create(`t_step_${i + 1}`)]),
  );

const recorder = () => {
  const warnings: string[] = [];
  return {
    warnings,
    log: { info: () => undefined, warn: (message: string) => void warnings.push(message) },
  };
};

interface Env {
  readonly client: DatabaseClient;
  tables(): Promise<string[]>;
  rows(sql: string): Promise<Record<string, unknown>[]>;
  dispose(): Promise<void>;
}

async function sqliteEnv(): Promise<Env> {
  const client = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
  if (client.dialect !== 'sqlite') throw new Error('expected SQLite');
  return {
    client,
    async tables() {
      return (
        client.raw
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
          )
          .all() as { name: string }[]
      ).map((row) => row.name);
    },
    async rows(sql) {
      return client.raw.prepare(sql).all() as Record<string, unknown>[];
    },
    dispose: () => client.close(),
  };
}

const postgresUrl = process.env.TEST_POSTGRES_URL ?? process.env.ADVENTURE_TEST_POSTGRES_URL;

/** A new, empty PostgreSQL schema (the connection's search_path) that is dropped afterwards. */
async function postgresEnv(): Promise<
  Env & { open(): Promise<PostgresDatabaseClient>; schema: string }
> {
  const schema = `migrate_test_${randomUUID().replaceAll('-', '')}`;
  const admin = (await createDatabaseClient({
    dialect: 'postgres',
    url: postgresUrl!,
  })) as PostgresDatabaseClient;
  await admin.raw.query(`CREATE SCHEMA "${schema}"`);
  const opened: PostgresDatabaseClient[] = [];
  const open = async () => {
    const url = new URL(postgresUrl!);
    url.searchParams.set('options', `-c search_path=${schema}`);
    // The advisory lock is database wide; the name lets a test count only its own connections.
    url.searchParams.set('application_name', schema);
    const client = (await createDatabaseClient({
      dialect: 'postgres',
      url: url.toString(),
    })) as PostgresDatabaseClient;
    opened.push(client);
    return client;
  };
  const client = await open();
  return {
    client,
    open,
    schema,
    async tables() {
      const { rows } = await admin.raw.query<{ name: string }>(
        `SELECT table_name AS name FROM information_schema.tables
          WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
        [schema],
      );
      return rows.map((row) => row.name);
    },
    async rows(sql) {
      return (await client.raw.query(sql)).rows;
    },
    async dispose() {
      for (const each of opened) await each.close();
      if (/^migrate_test_[a-f0-9]{32}$/.test(schema)) {
        await admin.raw.query(`DROP SCHEMA "${schema}" CASCADE`);
      }
      await admin.close();
    },
  };
}

describe.each(['sqlite', 'postgres'] as const)('migrateDatabase [%s]', (dialect) => {
  describe.skipIf(dialect === 'postgres' && !postgresUrl)('runner', () => {
    let env: Env & { open?(): Promise<PostgresDatabaseClient> };
    beforeEach(async () => {
      env = dialect === 'sqlite' ? await sqliteEnv() : await postgresEnv();
    });
    afterEach(async () => {
      await env.dispose();
    });

    it('creates the tracking table and applies every migration in id order on a fresh database', async () => {
      const result = await migrateDatabase(env.client, { migrations: [m3, m1, m2] });
      expect(result).toEqual({
        applied: [m1.id, m2.id, m3.id],
        alreadyApplied: [],
        unknown: [],
        backupPath: null,
        adoption: null,
      });
      expect((await env.tables()).sort()).toEqual(
        [MIGRATIONS_TABLE, 't_one', 't_three', 't_two'].sort(),
      );
      const rows = await env.rows(
        `SELECT id, checksum, contract, adopted FROM ${MIGRATIONS_TABLE} ORDER BY id`,
      );
      expect(rows.map((row) => row.id)).toEqual([m1.id, m2.id, m3.id]);
      expect(rows[0]!.checksum).toBe(m1.checksum);
      expect(rows.map((row) => Boolean(row.contract))).toEqual([false, false, false]);
      expect(rows.map((row) => Boolean(row.adopted))).toEqual([false, false, false]);
      expect(await env.rows('SELECT id FROM t_two')).toEqual([{ id: 1 }]);
    });

    it('stores applied_at from the injected clock and the contract flag', async () => {
      const at = new Date('2026-10-10T08:00:00.000Z');
      const contract = migration('0004_contract', ['SELECT 1'], { contract: true });
      await migrateDatabase(env.client, { migrations: [m1, contract], now: () => at });
      const rows = await env.rows(
        `SELECT id, contract, applied_at FROM ${MIGRATIONS_TABLE} ORDER BY id`,
      );
      expect(rows.map((row) => Boolean(row.contract))).toEqual([false, true]);
      expect(new Date(rows[0]!.applied_at as number | Date).getTime()).toBe(at.getTime());
    });

    it('does nothing on a second run', async () => {
      await migrateDatabase(env.client, { migrations: [m1, m2] });
      const again = await migrateDatabase(env.client, { migrations: [m1, m2] });
      expect(again).toEqual({
        applied: [],
        alreadyApplied: [m1.id, m2.id],
        unknown: [],
        backupPath: null,
        adoption: null,
      });
    });

    it('applies a migration that was added before an already applied one, by id', async () => {
      await migrateDatabase(env.client, { migrations: [m1, m3] });
      const result = await migrateDatabase(env.client, { migrations: [m1, m2, m3] });
      expect(result.applied).toEqual([m2.id]);
      expect(result.alreadyApplied).toEqual([m1.id, m3.id]);
    });

    it('rolls back only the failing migration and stops there', async () => {
      const broken = migration('0002_broken', [create('t_half'), 'THIS IS NOT SQL']);
      await expect(migrateDatabase(env.client, { migrations: [m1, broken, m3] })).rejects.toThrow(
        /0002_broken/,
      );

      // The first migration stays, the failing one left nothing, the third never ran.
      expect((await env.tables()).sort()).toEqual([MIGRATIONS_TABLE, 't_one'].sort());
      expect((await env.rows(`SELECT id FROM ${MIGRATIONS_TABLE}`)).map((row) => row.id)).toEqual([
        m1.id,
      ]);

      // Fixing the migration lets the rest run.
      const fixed = migration('0002_broken', [create('t_half')]);
      const result = await migrateDatabase(env.client, { migrations: [m1, fixed, m3] });
      expect(result.applied).toEqual(['0002_broken', m3.id]);
    });

    it('stops before any change when a recorded checksum differs, naming the id', async () => {
      await migrateDatabase(env.client, { migrations: [m1] });
      const edited = migration(m1.id, [create('t_one_edited')]);
      await expect(migrateDatabase(env.client, { migrations: [edited, m2] })).rejects.toThrow(
        /0001_first/,
      );
      expect((await env.tables()).sort()).toEqual([MIGRATIONS_TABLE, 't_one'].sort());
    });

    it('reports a dry run and changes nothing', async () => {
      const result = await migrateDatabase(env.client, { migrations: [m1, m2], dryRun: true });
      expect(result).toEqual({
        applied: [m1.id, m2.id],
        alreadyApplied: [],
        unknown: [],
        backupPath: null,
        adoption: null,
      });
      expect(await env.tables()).toEqual([]);

      await migrateDatabase(env.client, { migrations: [m1] });
      const next = await migrateDatabase(env.client, { migrations: [m1, m2], dryRun: true });
      expect(next.applied).toEqual([m2.id]);
      expect(next.alreadyApplied).toEqual([m1.id]);
      expect((await env.tables()).sort()).toEqual([MIGRATIONS_TABLE, 't_one'].sort());
    });

    it('still checks checksums on a dry run', async () => {
      await migrateDatabase(env.client, { migrations: [m1] });
      const edited = migration(m1.id, [create('t_one_edited')]);
      await expect(
        migrateDatabase(env.client, { migrations: [edited], dryRun: true }),
      ).rejects.toThrow(/0001_first/);
    });

    it('warns once about unknown ordinary migrations and continues', async () => {
      await migrateDatabase(env.client, { migrations: [m1, m2] });
      const { log, warnings } = recorder();
      const result = await migrateDatabase(env.client, { migrations: [m1, m3], log });
      expect(result.unknown).toEqual([m2.id]);
      expect(result.applied).toEqual([m3.id]);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain(m2.id);
    });

    it('refuses to start when an unknown migration is a contract migration', async () => {
      const contract = migration('0002_drop', ['SELECT 1'], { contract: true });
      await migrateDatabase(env.client, { migrations: [m1, contract] });
      const { log, warnings } = recorder();
      await expect(migrateDatabase(env.client, { migrations: [m1, m3], log })).rejects.toThrow(
        /newer release|pre-deploy dump/,
      );
      expect(warnings).toEqual([]);
      expect(await env.tables()).not.toContain('t_three');
    });

    it('refuses a database that has tables but no tracking table when there is no baseline to adopt it with', async () => {
      if (env.client.dialect === 'sqlite') env.client.raw.exec(create('legacy'));
      else await env.client.raw.query(create('legacy'));
      await expect(migrateDatabase(env.client, { migrations: [m1] })).rejects.toThrow(
        /no 0000_baseline migration to adopt it with/,
      );
      await expect(migrateDatabase(env.client, { migrations: [m1], dryRun: true })).rejects.toThrow(
        /no 0000_baseline migration to adopt it with/,
      );
      expect(await env.tables()).toEqual(['legacy']);
    });

    it('reports the status without changing anything', async () => {
      expect(await migrationStatus(env.client, { migrations: [m1, m2] })).toEqual({
        latest: m2.id,
        pending: [m1.id, m2.id],
        unknown: [],
        unknownContract: [],
        adopted: false,
      });
      expect(await env.tables()).toEqual([]);

      await migrateDatabase(env.client, { migrations: [m1, m3] });
      expect(await migrationStatus(env.client, { migrations: [m1, m2] })).toEqual({
        latest: m2.id,
        pending: [m2.id],
        unknown: [m3.id],
        unknownContract: [],
        adopted: false,
      });

      const flag = dialect === 'sqlite' ? '1' : 'true';
      if (env.client.dialect === 'sqlite') {
        env.client.raw.exec(
          `UPDATE ${MIGRATIONS_TABLE} SET adopted = ${flag} WHERE id = '${m1.id}'`,
        );
      } else {
        await env.client.raw.query(
          `UPDATE ${MIGRATIONS_TABLE} SET adopted = ${flag} WHERE id = '${m1.id}'`,
        );
      }
      expect((await migrationStatus(env.client, { migrations: [m1, m2] })).adopted).toBe(true);
    });

    it('reports the unknown contract migrations the downgrade guard refuses', async () => {
      const contract = migration('0004_contract', ['SELECT 1'], { contract: true });
      await migrateDatabase(env.client, { migrations: [m1, m3, contract] });
      const status = await migrationStatus(env.client, { migrations: [m1] });
      expect(status.unknown).toEqual([m3.id, contract.id]);
      expect(status.unknownContract).toEqual([contract.id]);
    });

    it('reports an empty migration list', async () => {
      expect(await migrationStatus(env.client, { migrations: [] })).toEqual({
        latest: null,
        pending: [],
        unknown: [],
        unknownContract: [],
        adopted: false,
      });
    });

    it('rejects a list with a duplicate id', async () => {
      await expect(migrateDatabase(env.client, { migrations: [m1, m1] })).rejects.toThrow(
        /listed twice/,
      );
    });

    it('uses the embedded list of its dialect by default', async () => {
      const embedded = dialect === 'sqlite' ? SQLITE_MIGRATIONS : PG_MIGRATIONS;
      const status = await migrationStatus(env.client);
      expect(status.pending).toEqual(embedded.map((each) => each.id));
      expect(status.latest).toBe(embedded.at(-1)!.id);
    });
  });
});

describe.skipIf(!postgresUrl)('migrateDatabase [postgres] locking', () => {
  let env: Awaited<ReturnType<typeof postgresEnv>>;
  beforeEach(async () => {
    env = await postgresEnv();
  });
  afterEach(async () => {
    await env.dispose();
  });

  const heldLocks = async () =>
    Number(
      (
        await env.rows(
          `SELECT count(*) AS count FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
            WHERE l.locktype = 'advisory' AND l.classid = 1706 AND a.application_name = '${env.schema}'`,
        )
      )[0]!.count,
    );

  it('applies each migration once when two runs start together', async () => {
    const other = await env.open();
    // CREATE TABLE without IF NOT EXISTS fails for whoever runs a migration a second time.
    const migrations = [m1, m2, m3];
    const [first, second] = await Promise.all([
      migrateDatabase(env.client, { migrations }),
      migrateDatabase(other, { migrations }),
    ]);
    expect([...first.applied, ...second.applied].sort()).toEqual([m1.id, m2.id, m3.id]);
    expect(first.applied.length === 0 || second.applied.length === 0).toBe(true);
    expect(await heldLocks()).toBe(0);
  });

  it('releases the lock after a failure', async () => {
    const broken = migration('0002_broken', ['THIS IS NOT SQL']);
    await expect(migrateDatabase(env.client, { migrations: [m1, broken] })).rejects.toThrow(
      /0002_broken/,
    );
    expect(await heldLocks()).toBe(0);
    const other = await env.open();
    await expect(migrateDatabase(other, { migrations: [m1] })).resolves.toMatchObject({
      alreadyApplied: [m1.id],
    });
  });

  it('releases the lock after a checksum failure and after a dry run', async () => {
    await migrateDatabase(env.client, { migrations: [m1] });
    const edited = migration(m1.id, [create('t_other')]);
    await expect(migrateDatabase(env.client, { migrations: [edited] })).rejects.toThrow();
    expect(await heldLocks()).toBe(0);
    await migrateDatabase(env.client, { migrations: [m1, m2], dryRun: true });
    expect(await heldLocks()).toBe(0);
  });

  it('creates the tracking table in the connection schema', async () => {
    await migrateDatabase(env.client, { migrations: [m1] });
    expect(await env.tables()).toContain(MIGRATIONS_TABLE);
  });
});

describe('migrateDatabase [sqlite] backups', () => {
  let directory: string;
  let client: DatabaseClient;
  let path: string;
  const clock = () => {
    let tick = 0;
    return () => new Date(Date.UTC(2026, 9, 10, 8, 0, tick++));
  };

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'ririko-runner-'));
    path = join(directory, 'ririko.sqlite');
    // autoMigrate off: the file starts empty, as a new install does.
    client = await createDatabaseClient({ dialect: 'sqlite', url: path, autoMigrate: false });
  });
  afterEach(async () => {
    await client.close();
    rmSync(directory, { recursive: true, force: true });
  });

  const backups = () => {
    const folder = join(directory, 'backups');
    return existsSync(folder) ? readdirSync(folder).sort() : [];
  };

  it('writes no backup for an empty database', async () => {
    const result = await migrateDatabase(client, { migrations: [m1, m2], now: clock() });
    expect(result.backupPath).toBeNull();
    expect(backups()).toEqual([]);
  });

  it('copies the database before pending migrations run on a database with tables', async () => {
    await migrateDatabase(client, { migrations: [m1], now: clock() });
    const result = await migrateDatabase(client, {
      migrations: [m1, m2],
      now: () => new Date('2026-10-10T08:30:15.123Z'),
    });

    expect(result.backupPath).toBe(
      join(directory, 'backups', 'pre-migrate-20261010T083015123Z.sqlite'),
    );
    expect(dirname(result.backupPath!)).toBe(join(directory, 'backups'));
    expect(backups()).toEqual(['pre-migrate-20261010T083015123Z.sqlite']);

    // It holds the state before the second migration.
    const copy = new DatabaseConstructor(result.backupPath!, { readonly: true });
    const names = (
      copy.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
        name: string;
      }[]
    ).map((row) => row.name);
    copy.close();
    expect(names).toContain('t_one');
    expect(names).not.toContain('t_two');
  });

  it('writes no backup when nothing is pending, or on a dry run', async () => {
    await migrateDatabase(client, { migrations: [m1], now: clock() });
    expect(
      (await migrateDatabase(client, { migrations: [m1], now: clock() })).backupPath,
    ).toBeNull();
    const dry = await migrateDatabase(client, { migrations: [m1, m2], dryRun: true, now: clock() });
    expect(dry.backupPath).toBeNull();
    expect(backups()).toEqual([]);
  });

  it('writes no backup when a checksum mismatch stops the run', async () => {
    await migrateDatabase(client, { migrations: [m1], now: clock() });
    const edited = migration(m1.id, [create('t_one_edited')]);
    await expect(
      migrateDatabase(client, { migrations: [edited, m2], now: clock() }),
    ).rejects.toThrow();
    expect(backups()).toEqual([]);
  });

  it('keeps the newest five backups', async () => {
    const now = clock();
    const all = steps(SQLITE_BACKUPS_KEPT + 3);
    const written: string[] = [];
    for (let count = 1; count <= all.length; count++) {
      const result = await migrateDatabase(client, { migrations: all.slice(0, count), now });
      if (result.backupPath) written.push(basename(result.backupPath));
    }
    // The first run had an empty database; every later run copied it.
    expect(written).toHaveLength(all.length - 1);
    expect(backups()).toEqual(written.slice(-SQLITE_BACKUPS_KEPT));
  });

  it('leaves files that are not backups alone when it prunes', async () => {
    const now = clock();
    const all = steps(SQLITE_BACKUPS_KEPT + 2);
    await migrateDatabase(client, { migrations: all.slice(0, 1), now });
    mkdirSync(join(directory, 'backups'));
    writeFileSync(join(directory, 'backups', 'notes.txt'), 'keep me');
    for (let count = 2; count <= all.length; count++) {
      await migrateDatabase(client, { migrations: all.slice(0, count), now });
    }
    expect(readdirSync(join(directory, 'backups'))).toContain('notes.txt');
    expect(backups().filter((name) => name.startsWith('pre-migrate-'))).toHaveLength(
      SQLITE_BACKUPS_KEPT,
    );
  });

  it('writes no backup for an in-memory database', async () => {
    const memory = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    await migrateDatabase(memory, { migrations: [m1] });
    const result = await migrateDatabase(memory, { migrations: [m1, m2] });
    expect(result.backupPath).toBeNull();
    await memory.close();
  });

  it('logs the backup and each applied migration', async () => {
    await migrateDatabase(client, { migrations: [m1], now: clock() });
    const info = vi.fn();
    await migrateDatabase(client, {
      migrations: [m1, m2],
      now: clock(),
      log: { info, warn: vi.fn() },
    });
    const lines = info.mock.calls.map((call) => String(call[0]));
    expect(lines.some((line) => line.includes('backup'))).toBe(true);
    expect(lines.some((line) => line.includes(m2.id))).toBe(true);
  });
});

describe('migrateDatabase [sqlite] table rebuilds', () => {
  let client: Extract<DatabaseClient, { dialect: 'sqlite' }>;

  beforeEach(async () => {
    const created = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (created.dialect !== 'sqlite') throw new Error('expected SQLite');
    client = created;
  });
  afterEach(async () => {
    await client.close();
  });

  const parents = migration('0001_parents', [
    'CREATE TABLE parent (id integer PRIMARY KEY NOT NULL, name text NOT NULL)',
    'CREATE TABLE child (id integer PRIMARY KEY NOT NULL, parent_id integer NOT NULL, FOREIGN KEY (parent_id) REFERENCES parent(id) ON DELETE CASCADE)',
    'CREATE TABLE audit (id integer PRIMARY KEY NOT NULL, parent_id integer, FOREIGN KEY (parent_id) REFERENCES parent(id))',
  ]);

  /** The shape drizzle-kit writes for a SQLite table rebuild, one statement per breakpoint. */
  const rebuild = (copy: string, extra: string[] = []) =>
    migration(
      '0002_rebuild',
      [
        'PRAGMA foreign_keys=OFF;',
        "CREATE TABLE `__new_parent` (id integer PRIMARY KEY NOT NULL, name text NOT NULL, nick text DEFAULT 'none');",
        copy,
        'DROP TABLE `parent`;',
        'ALTER TABLE `__new_parent` RENAME TO `parent`;',
        ...extra,
        'PRAGMA foreign_keys=ON;',
      ],
      { contract: true },
    );
  const copyAll = 'INSERT INTO `__new_parent`(id, name) SELECT id, name FROM `parent`;';

  async function seed(): Promise<void> {
    await migrateDatabase(client, { migrations: [parents] });
    client.raw.exec(`
      INSERT INTO parent (id, name) VALUES (1, 'one'), (2, 'two');
      INSERT INTO child (id, parent_id) VALUES (10, 1), (11, 1), (12, 2);
      INSERT INTO audit (id, parent_id) VALUES (20, 2);
    `);
  }

  const count = (table: string) =>
    (client.raw.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
  const foreignKeys = () => client.raw.pragma('foreign_keys', { simple: true });

  it('keeps ON DELETE CASCADE children and referencing rows when a parent table is rebuilt', async () => {
    await seed();
    expect(foreignKeys()).toBe(1);

    const result = await migrateDatabase(client, { migrations: [parents, rebuild(copyAll)] });

    expect(result.applied).toEqual(['0002_rebuild']);
    expect(count('parent')).toBe(2);
    expect(count('child')).toBe(3);
    expect(count('audit')).toBe(1);
    // The new column is there, and the references still work afterwards.
    expect(client.raw.prepare('SELECT nick FROM parent WHERE id = 1').get()).toEqual({
      nick: 'none',
    });
    expect(client.raw.pragma('foreign_key_check')).toEqual([]);
    expect(() => client.raw.exec('INSERT INTO child (id, parent_id) VALUES (13, 99)')).toThrow(
      /FOREIGN KEY/,
    );
    // Foreign keys are back on, and the migration is recorded once.
    expect(foreignKeys()).toBe(1);
    const recorded = client.raw
      .prepare(`SELECT id, contract FROM ${MIGRATIONS_TABLE} ORDER BY id`)
      .all();
    expect(recorded).toEqual([
      { id: '0001_parents', contract: 0 },
      { id: '0002_rebuild', contract: 1 },
    ]);
  });

  it('rolls back a rebuild that leaves a dangling reference and names the table', async () => {
    await seed();
    const lossy = rebuild(
      'INSERT INTO `__new_parent`(id, name) SELECT id, name FROM `parent` WHERE id = 1;',
    );

    await expect(migrateDatabase(client, { migrations: [parents, lossy] })).rejects.toThrow(
      /0002_rebuild failed and was rolled back.*table "child" has 1 row\(s\).*"parent"/,
    );
    await expect(migrateDatabase(client, { migrations: [parents, lossy] })).rejects.toThrow(
      /table "audit" has 1 row\(s\)/,
    );

    // The old parent table and every row are untouched, and nothing is recorded.
    expect(count('parent')).toBe(2);
    expect(count('child')).toBe(3);
    expect(
      client.raw.prepare("SELECT name FROM sqlite_master WHERE name = '__new_parent'").get(),
    ).toBe(undefined);
    expect(
      client.raw.prepare(`SELECT id FROM ${MIGRATIONS_TABLE} WHERE id = '0002_rebuild'`).get(),
    ).toBeUndefined();
    expect(foreignKeys()).toBe(1);
  });

  it('restores foreign keys when a statement of the rebuild fails', async () => {
    await seed();
    const broken = rebuild(copyAll, ['SELECT * FROM table_that_does_not_exist;']);

    await expect(migrateDatabase(client, { migrations: [parents, broken] })).rejects.toThrow(
      /0002_rebuild failed and was rolled back/,
    );

    expect(count('parent')).toBe(2);
    expect(count('child')).toBe(3);
    expect(foreignKeys()).toBe(1);
  });

  it('leaves foreign keys off on a connection that had them off', async () => {
    await seed();
    client.raw.pragma('foreign_keys = OFF');

    await migrateDatabase(client, { migrations: [parents, rebuild(copyAll)] });

    expect(count('child')).toBe(3);
    expect(foreignKeys()).toBe(0);
  });

  it('leaves foreign keys alone for a migration without the rebuild pragma', async () => {
    await seed();
    await migrateDatabase(client, { migrations: [parents, m1] });
    expect(foreignKeys()).toBe(1);
  });

  it('shows the cascade that the rebuild procedure prevents', async () => {
    await seed();
    client.raw.exec('DELETE FROM audit');
    // drizzle-kit's statements in one transaction, as the runner used to run them: the pragma is
    // ignored and DROP TABLE deletes the children.
    client.raw.exec('BEGIN');
    client.raw.exec('PRAGMA foreign_keys=OFF');
    client.raw.exec('DROP TABLE parent');
    client.raw.exec('COMMIT');
    expect(count('child')).toBe(0);
  });

  it('refuses a rebuild when another transaction made the pragma a no-op', async () => {
    await seed();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const holder = withTransaction(client, () => gate);
    const run = migrateDatabase(client, { migrations: [parents, rebuild(copyAll)] });
    const outcome = expect(run).rejects.toThrow(
      /0002_rebuild failed and was rolled back.*Foreign keys could not be turned off/,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    release();
    await holder;
    await outcome;

    expect(count('parent')).toBe(2);
    expect(count('child')).toBe(3);
    expect(foreignKeys()).toBe(1);
  });
});
