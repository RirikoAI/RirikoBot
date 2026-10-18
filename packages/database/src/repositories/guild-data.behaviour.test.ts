import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Column, getTableColumns, getTableName, is, Table } from 'drizzle-orm';
import type { DatabaseClient } from '../client/types.js';
import { PG_MIGRATIONS } from '../migrations/generated/pg.js';
import { SQLITE_MIGRATIONS } from '../migrations/generated/sqlite.js';
import * as pgSchema from '../schema/pg/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import { describeDialects } from '../testing/dialects.js';
import { GuildDataRepository } from './guild-data.repository.js';
import { GUILD_CHILD_DATA, GUILD_DATA_INVENTORY, GUILD_ID_COLUMN } from './guild-data-inventory.js';
import { GuildRepository } from './guild.repository.js';

/** The purge cutoff: servers that left before it go. Each case is tested 1 ms either side. */
const CUTOFF = new Date('2026-10-17T00:00:00.000Z');
const before = (ms = 1) => new Date(CUTOFF.getTime() - ms);
const after = (ms = 1) => new Date(CUTOFF.getTime() + ms);

type Row = Record<string, unknown>;

/** A UUID derived from `seed`, for the columns PostgreSQL types as uuid; text columns take it too. */
const uuidOf = (seed: string): string => {
  const h = createHash('md5').update(seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};

/** Runs SQL with `?` placeholders on either dialect and returns the rows. */
async function query<T>(client: DatabaseClient, sql: string, params: unknown[] = []): Promise<T[]> {
  if (client.dialect === 'sqlite') return client.raw.prepare(sql).all(...params) as T[];
  let index = 0;
  const numbered = sql.replace(/\?/g, () => `$${++index}`);
  return (await client.raw.query(numbered, params)).rows as T[];
}

async function exec(client: DatabaseClient, sql: string): Promise<void> {
  if (client.dialect === 'sqlite') client.raw.exec(sql);
  else await client.raw.query(sql);
}

const count = async (
  client: DatabaseClient,
  table: string,
  where = '1 = 1',
  params: unknown[] = [],
): Promise<number> =>
  Number(
    (
      await query<{ n: number | string }>(
        client,
        `SELECT count(*) AS n FROM "${table}" WHERE ${where}`,
        params,
      )
    )[0]?.n,
  );

/** The Drizzle tables of the dialect by SQL name. */
function tablesByName(client: DatabaseClient): Map<string, Table> {
  const module = (client.dialect === 'sqlite' ? sqliteSchema : pgSchema) as Record<string, unknown>;
  const map = new Map<string, Table>();
  for (const value of Object.values(module))
    if (is(value, Table)) map.set(getTableName(value), value);
  return map;
}

/**
 * One valid row for `table` with the server id `guildId`: every required column without a default
 * gets a value that is unique per server and column, so rows of different servers never collide.
 * `overrides` is keyed by column name.
 */
function fixture(
  table: Table,
  guildId: string | null,
  overrides: Row = {},
  tag: string = guildId ?? 'nobody',
): Row {
  const row: Row = {};
  for (const [key, column] of Object.entries(getTableColumns(table))) {
    if (!is(column, Column)) continue;
    const name = column.name;
    if (name in overrides) {
      row[key] = overrides[name];
    } else if (name === GUILD_ID_COLUMN) {
      row[key] = guildId !== null && column.columnType === 'PgUUID' ? uuidOf(guildId) : guildId;
    } else if (column.notNull && !column.hasDefault) {
      switch (column.dataType) {
        case 'string':
          row[key] =
            column.enumValues?.[0] ??
            (column.columnType === 'PgUUID' ? uuidOf(`${tag}:${name}`) : `${tag}:${name}`);
          break;
        case 'number':
          row[key] = 1;
          break;
        case 'boolean':
          row[key] = false;
          break;
        case 'date':
          row[key] = new Date('2026-01-01T00:00:00.000Z');
          break;
        case 'json':
          row[key] = {};
          break;
        default:
          throw new Error(
            `fixture: no value for ${getTableName(table)}.${name} (${column.dataType})`,
          );
      }
    }
  }
  return row;
}

async function insert(client: DatabaseClient, table: Table, rows: Row | Row[]): Promise<void> {
  const db = client.db as unknown as {
    insert(table: Table): { values(rows: Row | Row[]): PromiseLike<unknown> };
  };
  await db.insert(table).values(rows);
}

const GONE = 'gone';
const KEPT = 'kept';

describeDialects('GuildDataRepository behaviour', (db) => {
  const guilds = () => tablesByName(db.client).get('guilds')!;
  const table = (name: string) => tablesByName(db.client).get(name)!;

  /** A `guilds` row: the bot left at `leftAt` (null = still in the server). */
  async function addGuild(id: string, leftAt: Date | null, isActive = leftAt === null) {
    await insert(
      db.client,
      guilds(),
      fixture(guilds(), null, { id, is_active: isActive, left_at: leftAt }),
    );
  }

  /** The parent rows of the child tables get a known id so the children can point at them. */
  const parentId = (parentTable: string, guildId: string | null) =>
    uuidOf(`${guildId ?? 'nobody'}:${parentTable}`);
  const parentColumns = new Set(GUILD_CHILD_DATA.map((child) => child.parentTable));

  const guildColumn = (t: Table) =>
    Object.values(getTableColumns(t)).find((column) => column.name === GUILD_ID_COLUMN)!;
  /** Whether a row can belong to no server (a DM) in this table. */
  const allowsNoServer = (name: string) => !guildColumn(table(name)).notNull;

  /**
   * One row per inventoried table for the server, and one row per child table for each of its
   * parent rows. `null` seeds the rows that belong to no server, where the column allows it.
   */
  async function seedServer(guildId: string | null) {
    const seeded = new Set<string>();
    for (const entry of GUILD_DATA_INVENTORY) {
      if (guildId === null && !allowsNoServer(entry.table)) continue;
      const t = table(entry.table);
      const overrides: Row = parentColumns.has(entry.table)
        ? { id: parentId(entry.table, guildId) }
        : {};
      await insert(db.client, t, fixture(t, guildId, overrides));
      seeded.add(entry.table);
    }
    for (const child of GUILD_CHILD_DATA) {
      if (!seeded.has(child.parentTable)) continue;
      const t = table(child.table);
      await insert(
        db.client,
        t,
        fixture(
          t,
          null,
          { [child.column]: parentId(child.parentTable, guildId) },
          guildId ?? 'nobody',
        ),
      );
    }
  }

  /** Rows that belong to users, not servers, and must never change. */
  const USER_TABLES = ['users', 'economy_balances', 'ai_user_preferences', 'user_consents'];
  async function seedUsers() {
    for (const name of USER_TABLES) {
      await insert(db.client, table(name), fixture(table(name), null));
    }
  }
  const userRows = async () =>
    Object.fromEntries(
      await Promise.all(
        USER_TABLES.map(
          async (name) => [name, await query<Row>(db.client, `SELECT * FROM "${name}"`)] as const,
        ),
      ),
    );

  describe('purgeGuild', () => {
    it('deletes every inventoried table for the departed server and leaves everything else', async () => {
      await addGuild(GONE, before());
      await addGuild(KEPT, null);
      await seedServer(GONE);
      await seedServer(KEPT);
      await seedServer(null);
      await seedUsers();
      const users = await userRows();
      const repo = new GuildDataRepository(db.client);

      const result = await repo.purgeGuild(GONE, CUTOFF);

      expect(result).not.toBeNull();
      expect(result!.guildId).toBe(GONE);
      for (const entry of GUILD_DATA_INVENTORY) {
        const where = (id: string) =>
          count(db.client, entry.table, `"guild_id" = ?`, [
            guildColumn(table(entry.table)).columnType === 'PgUUID' ? uuidOf(id) : id,
          ]);
        const total = await count(db.client, entry.table);
        const nobody = await count(db.client, entry.table, `"guild_id" IS NULL`);
        switch (entry.action) {
          case 'delete':
            expect(await where(GONE), `${entry.table} gone`).toBe(0);
            expect(await where(KEPT), `${entry.table} kept`).toBe(1);
            expect(result!.deleted[entry.table], `${entry.table} counted`).toBe(1);
            break;
          case 'detach':
            // The server's row stays as a row of nobody; nothing is deleted.
            expect(await where(GONE), `${entry.table} gone`).toBe(0);
            expect(await where(KEPT), `${entry.table} kept`).toBe(1);
            expect(total, `${entry.table} total`).toBe(3);
            expect(nobody, `${entry.table} nobody`).toBe(2);
            expect(result!.detached[entry.table], `${entry.table} counted`).toBe(1);
            break;
          case 'exclude':
            expect(await where(GONE), `${entry.table} gone`).toBe(1);
            expect(await where(KEPT), `${entry.table} kept`).toBe(1);
            expect(entry.table in result!.deleted).toBe(false);
            expect(entry.table in result!.detached).toBe(false);
            break;
        }
        if (entry.action === 'delete' && nobody > 0)
          expect(nobody, `${entry.table} nobody`).toBe(1);
      }
      for (const child of GUILD_CHILD_DATA) {
        const rows = await query<Row>(
          db.client,
          `SELECT "${child.column}" AS ref FROM "${child.table}"`,
        );
        const expected = [parentId(child.parentTable, KEPT)];
        if (allowsNoServer(child.parentTable)) expected.push(parentId(child.parentTable, null));
        expect(rows.map((r) => r.ref).sort(), child.table).toEqual(expected.sort());
        expect(result!.deleted[child.table], `${child.table} counted`).toBe(1);
      }
      expect(await query(db.client, `SELECT id FROM guilds`)).toEqual([{ id: KEPT }]);
      expect(result!.deleted['guilds']).toBe(1);
      expect(await userRows()).toEqual(users);
    });

    it('purges only the server asked for', async () => {
      await addGuild('gone-a', before(2));
      await addGuild('gone-b', before(1));
      await seedServer('gone-a');
      await seedServer('gone-b');
      const repo = new GuildDataRepository(db.client);

      await repo.purgeGuild('gone-a', CUTOFF);

      expect(await count(db.client, 'xp_accounts', `"guild_id" = ?`, ['gone-a'])).toBe(0);
      expect(await count(db.client, 'xp_accounts', `"guild_id" = ?`, ['gone-b'])).toBe(1);
      expect(
        (await query<{ id: string }>(db.client, `SELECT id FROM guilds`)).map((r) => r.id),
      ).toEqual(['gone-b']);
    });

    it('removes the server row when the server has no other data', async () => {
      await addGuild(GONE, before());
      const repo = new GuildDataRepository(db.client);

      const result = await repo.purgeGuild(GONE, CUTOFF);

      expect(result).toEqual({ guildId: GONE, deleted: { guilds: 1 }, detached: {} });
      expect(await count(db.client, 'guilds')).toBe(0);
    });

    it('works through a table in batches of the given size', async () => {
      await addGuild(GONE, before());
      const xp = table('xp_accounts');
      await insert(
        db.client,
        xp,
        [1, 2, 3, 4, 5].map((n) => fixture(xp, GONE, { user_id: `u${n}` })),
      );
      const reminders = table('reminders');
      await insert(
        db.client,
        reminders,
        [1, 2, 3].map((n) => fixture(reminders, GONE, { id: uuidOf(`r${n}`) })),
      );
      const repo = new GuildDataRepository(db.client);

      const result = await repo.purgeGuild(GONE, CUTOFF, 2);

      expect(result?.deleted).toEqual({ xp_accounts: 5, guilds: 1 });
      expect(result?.detached).toEqual({ reminders: 3 });
      expect(await count(db.client, 'xp_accounts')).toBe(0);
      expect(await count(db.client, 'reminders', `"guild_id" IS NULL`)).toBe(3);
    });

    it('rolls the whole server back when one table fails', async () => {
      await addGuild(GONE, before());
      await seedServer(GONE);
      const totals = async () => ({
        guilds: await count(db.client, 'guilds'),
        settings: await count(db.client, 'guild_settings'),
        messages: await count(db.client, 'ai_messages'),
        reminders: await count(db.client, 'reminders', `"guild_id" = ?`, [GONE]),
        xp: await count(db.client, 'xp_events'),
      });
      const initial = await totals();
      expect(initial).toEqual({ guilds: 1, settings: 1, messages: 1, reminders: 1, xp: 1 });
      if (db.dialect === 'sqlite') {
        await exec(
          db.client,
          `CREATE TRIGGER block_xp_events BEFORE DELETE ON xp_events BEGIN SELECT RAISE(ABORT, 'blocked'); END`,
        );
      } else {
        await exec(
          db.client,
          `CREATE FUNCTION block_delete() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'blocked'; END $$ LANGUAGE plpgsql`,
        );
        await exec(
          db.client,
          `CREATE TRIGGER block_xp_events BEFORE DELETE ON xp_events FOR EACH ROW EXECUTE FUNCTION block_delete()`,
        );
      }
      const repo = new GuildDataRepository(db.client);

      try {
        await expect(repo.purgeGuild(GONE, CUTOFF)).rejects.toThrow(/xp_events/);
        expect(await totals()).toEqual(initial);
      } finally {
        await exec(
          db.client,
          `DROP TRIGGER block_xp_events${db.dialect === 'postgres' ? ' ON xp_events' : ''}`,
        );
        if (db.dialect === 'postgres') await exec(db.client, `DROP FUNCTION block_delete()`);
      }
    });

    it('does nothing for a server whose departure is not before the cutoff', async () => {
      await addGuild('edge', CUTOFF);
      await addGuild('later', after());
      await seedServer('edge');
      const repo = new GuildDataRepository(db.client);

      expect(await repo.purgeGuild('edge', CUTOFF)).toBeNull();
      expect(await repo.purgeGuild('later', CUTOFF)).toBeNull();

      expect(await count(db.client, 'xp_accounts', `"guild_id" = ?`, ['edge'])).toBe(1);
      expect(await count(db.client, 'guilds')).toBe(2);
    });

    it('purges a server that left one millisecond before the cutoff', async () => {
      await addGuild('edge', before());
      await seedServer('edge');
      const repo = new GuildDataRepository(db.client);

      expect(await repo.purgeGuild('edge', CUTOFF)).not.toBeNull();

      expect(await count(db.client, 'xp_accounts')).toBe(0);
      expect(await count(db.client, 'guilds')).toBe(0);
    });

    it('does nothing for a server the bot is in, even with an old left_at', async () => {
      await addGuild('active', before(10_000), true);
      await seedServer('active');
      const repo = new GuildDataRepository(db.client);

      expect(await repo.purgeGuild('active', CUTOFF)).toBeNull();

      expect(await count(db.client, 'xp_accounts')).toBe(1);
      expect(await count(db.client, 'guilds')).toBe(1);
    });

    it('does nothing for an inactive server without a left_at, or one that is unknown', async () => {
      await addGuild('stale', null, false);
      await seedServer('stale');
      const repo = new GuildDataRepository(db.client);

      expect(await repo.purgeGuild('stale', CUTOFF)).toBeNull();
      expect(await repo.purgeGuild('never-seen', CUTOFF)).toBeNull();

      expect(await count(db.client, 'xp_accounts')).toBe(1);
      expect(await count(db.client, 'guilds')).toBe(1);
    });
  });

  describe('listDepartedBefore', () => {
    it('lists the servers that left before the cutoff, oldest first, never the one at it', async () => {
      await addGuild('b-old', before(20));
      await addGuild('a-newer', before(10));
      await addGuild('at-cutoff', CUTOFF);
      await addGuild('just-before', before(1));
      await addGuild('after', after());
      await addGuild('in-server', null);
      await addGuild('stale', null, false);
      const repo = new GuildDataRepository(db.client);

      expect(await repo.listDepartedBefore(CUTOFF)).toEqual(['b-old', 'a-newer', 'just-before']);
    });

    it('is empty when no server left', async () => {
      await addGuild('in-server', null);
      expect(await new GuildDataRepository(db.client).listDepartedBefore(CUTOFF)).toEqual([]);
    });
  });

  describe('a server the bot is added back to', () => {
    it('is not listed and keeps all its data', async () => {
      const guildRepo = new GuildRepository(db.client);
      const repo = new GuildDataRepository(db.client);
      await guildRepo.upsert({
        id: GONE,
        name: 'S',
        iconUrl: null,
        ownerId: 'o',
        joinedAt: before(1000),
      });
      await seedServer(GONE);
      await guildRepo.markInactive([GONE]);
      // Pretend the bot left long ago.
      await exec(
        db.client,
        db.dialect === 'sqlite'
          ? `UPDATE guilds SET left_at = ${before(500).getTime()}`
          : `UPDATE guilds SET left_at = '${before(500).toISOString()}'`,
      );
      expect(await repo.listDepartedBefore(CUTOFF)).toEqual([GONE]);

      await guildRepo.upsert({
        id: GONE,
        name: 'S',
        iconUrl: null,
        ownerId: 'o',
        joinedAt: new Date(),
      });

      expect(await repo.listDepartedBefore(new Date('2100-01-01T00:00:00.000Z'))).toEqual([]);
      expect(await repo.purgeGuild(GONE, new Date('2100-01-01T00:00:00.000Z'))).toBeNull();
      expect(await count(db.client, 'xp_accounts', `"guild_id" = ?`, [GONE])).toBe(1);
      expect(await count(db.client, 'ai_messages')).toBe(1);
    });

    it('keeps its data when it is added back between the list and the purge', async () => {
      const guildRepo = new GuildRepository(db.client);
      const repo = new GuildDataRepository(db.client);
      await guildRepo.upsert({
        id: GONE,
        name: 'S',
        iconUrl: null,
        ownerId: 'o',
        joinedAt: before(1000),
      });
      await seedServer(GONE);
      await guildRepo.markInactive([GONE]);
      await exec(
        db.client,
        db.dialect === 'sqlite'
          ? `UPDATE guilds SET left_at = ${before(500).getTime()}`
          : `UPDATE guilds SET left_at = '${before(500).toISOString()}'`,
      );
      const listed = await repo.listDepartedBefore(CUTOFF);
      expect(listed).toEqual([GONE]);

      await guildRepo.upsert({
        id: GONE,
        name: 'S',
        iconUrl: null,
        ownerId: 'o',
        joinedAt: new Date(),
      });

      expect(await repo.purgeGuild(listed[0]!, CUTOFF)).toBeNull();
      expect(await count(db.client, 'xp_accounts', `"guild_id" = ?`, [GONE])).toBe(1);
      expect(await count(db.client, 'guilds')).toBe(1);
    });
  });

  describe('migration 0004_guild_left_at', () => {
    it('starts the 90 days of a server already marked inactive when the migration runs', async () => {
      const migrations = db.dialect === 'sqlite' ? SQLITE_MIGRATIONS : PG_MIGRATIONS;
      const migration = migrations.find((candidate) => candidate.id === '0004_guild_left_at');
      expect(migration).toBeDefined();
      const backfill = migration!.statements.at(-1)!;
      expect(backfill).toMatch(/UPDATE/);
      expect(backfill).not.toMatch(/updated_at/);
      // Long inactive: its updated_at is a year old, which must not count as the departure.
      const longAgo = new Date(Date.now() - 365 * 86_400_000);
      const stampedAt = new Date(Date.now() - 100 * 86_400_000);
      await insert(db.client, guilds(), [
        fixture(guilds(), null, { id: 'left-before', is_active: false, updated_at: longAgo }),
        fixture(guilds(), null, { id: 'in-server', is_active: true, updated_at: longAgo }),
        fixture(guilds(), null, {
          id: 'stamped',
          is_active: false,
          left_at: stampedAt,
          updated_at: longAgo,
        }),
      ]);
      const started = Date.now();

      await exec(db.client, backfill);

      // Read through Drizzle, as the bot does, so the storage mode is proven, not assumed.
      const guildRepo = new GuildRepository(db.client);
      const migrated = (await guildRepo.findById('left-before'))?.leftAt;
      expect(migrated).toBeInstanceOf(Date);
      expect(migrated!.getTime()).toBeGreaterThanOrEqual(started - 5_000);
      expect(migrated!.getTime()).toBeLessThanOrEqual(Date.now() + 5_000);
      expect((await guildRepo.findById('in-server'))?.leftAt).toBeNull();
      expect((await guildRepo.findById('stamped'))?.leftAt).toEqual(stampedAt);

      // Right after the migration only the server that was stamped long ago is due.
      const repo = new GuildDataRepository(db.client);
      const cutoff = new Date(Date.now() - 90 * 86_400_000);
      expect(await repo.listDepartedBefore(cutoff)).toEqual(['stamped']);
      expect(await repo.purgeGuild('left-before', cutoff)).toBeNull();
      expect(await count(db.client, 'guilds', `"id" = ?`, ['left-before'])).toBe(1);
    });
  });
});
