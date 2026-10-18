import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Column, getTableColumns, getTableName, is, Table } from 'drizzle-orm';
import { ValidationError } from '@ririko/core';
import type { DatabaseClient } from '../client/types.js';
import * as pgSchema from '../schema/pg/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import { describeDialects } from '../testing/dialects.js';
import {
  USER_CHILD_DATA,
  USER_DATA_INVENTORY,
  erasedMarker,
  type UserDataEntry,
} from './user-data-inventory.js';
import { UserDataRepository, type UserDataOperation } from './user-data.repository.js';

const TARGET = '100000000000000042';
const OTHER = '100000000000000043';
const MARKER = erasedMarker(TARGET);
const NOW = new Date('2026-10-18T00:00:00.000Z');

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

/** The text of a JSON column as the dialect returns it (a string in SQLite, a value in PostgreSQL). */
const asText = (value: unknown): string =>
  typeof value === 'string' ? value : JSON.stringify(value);

/** The Drizzle tables of the dialect by SQL name. */
function tablesByName(client: DatabaseClient): Map<string, Table> {
  const module = (client.dialect === 'sqlite' ? sqliteSchema : pgSchema) as Record<string, unknown>;
  const map = new Map<string, Table>();
  for (const value of Object.values(module))
    if (is(value, Table)) map.set(getTableName(value), value);
  return map;
}

/** A text unique to `seed` that fits a varchar of `limit` characters (24 at most). */
const shortText = (seed: string, limit = 24): string =>
  createHash('md5').update(seed).digest('hex').slice(0, Math.min(24, limit));

/**
 * One valid row for `table`: every required column without a default gets a value that is unique
 * per `tag` and column, so rows of different users never collide. `overrides` is keyed by column name.
 */
function fixture(table: Table, overrides: Row, tag: string): Row {
  const row: Row = {};
  for (const [key, column] of Object.entries(getTableColumns(table))) {
    if (!is(column, Column)) continue;
    const name = column.name;
    if (name in overrides) {
      row[key] = overrides[name];
    } else if (column.notNull && !column.hasDefault) {
      switch (column.dataType) {
        case 'string':
          row[key] =
            column.enumValues?.[0] ??
            (column.columnType === 'PgUUID'
              ? uuidOf(`${tag}:${name}`)
              : shortText(`${tag}:${name}`, (column as { length?: number }).length));
          break;
        case 'number':
          row[key] = 1;
          break;
        case 'bigint':
          row[key] = 1n;
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

/** Values a table needs beyond the user column to make the test meaningful. */
const EXTRA: Record<string, Row> = {
  // The browser name and IP address go with the actor ID.
  'audit_logs.actor_user_id': { ip_address: '203.0.113.9', user_agent: 'TestBrowser/1.0' },
  // A finished trade, so it is not cancelled (pending trades have their own test).
  'card_trades.receiver_user_id': { status: 'ACCEPTED' },
  'card_trades.sender_user_id': { status: 'ACCEPTED' },
};

const key = (entry: UserDataEntry) => `${entry.table}.${entry.column}`;

/** The entries the generic seed covers: guilds led by the user have their own test. */
const SEEDED = USER_DATA_INVENTORY.filter((entry) => entry.table !== 'waifu_guilds');

describeDialects('UserDataRepository behaviour', (db) => {
  const table = (name: string) => tablesByName(db.client).get(name)!;
  const parentTables = new Set(USER_CHILD_DATA.map((child) => child.parentTable));
  const parentId = (parentTable: string, userId: string) => uuidOf(`${userId}:${parentTable}`);

  /** One row per inventoried column that holds `userId`, and one row per child of each parent. */
  async function seedUser(userId: string) {
    for (const entry of SEEDED) {
      const t = table(entry.table);
      const overrides: Row = { [entry.column]: userId, ...EXTRA[key(entry)] };
      if (parentTables.has(entry.table)) overrides['id'] = parentId(entry.table, userId);
      await insert(db.client, t, fixture(t, overrides, `${userId}:${key(entry)}`));
    }
    for (const child of USER_CHILD_DATA) {
      const t = table(child.table);
      await insert(
        db.client,
        t,
        fixture(
          t,
          { [child.column]: parentId(child.parentTable, userId) },
          `${userId}:${child.table}`,
        ),
      );
    }
  }

  /** The rows that carry the ID in JSON and belong to somebody else. */
  async function seedMentions(userId: string, otherId: string) {
    const ledger = table('economy_transactions');
    await insert(
      db.client,
      ledger,
      fixture(
        ledger,
        { user_id: otherId, metadata: { senderId: userId, direction: 'CREDIT', note: 'keep me' } },
        `${otherId}:mentioned-ledger`,
      ),
    );
    const audit = table('audit_logs');
    await insert(
      db.client,
      audit,
      fixture(
        audit,
        {
          actor_user_id: otherId,
          action: 'giveaway.end',
          details: { winnerIds: [userId, otherId], userId },
        },
        `${otherId}:mentioned-audit`,
      ),
    );
    const cases = table('moderation_cases');
    await insert(
      db.client,
      cases,
      fixture(
        cases,
        {
          target_user_id: otherId,
          moderator_user_id: otherId,
          metadata: { relatedUserId: userId },
        },
        `${otherId}:mentioned-case`,
      ),
    );
  }

  const tableTotals = async () =>
    Object.fromEntries(
      await Promise.all(
        [...tablesByName(db.client).keys()].map(
          async (name) => [name, await count(db.client, name)] as const,
        ),
      ),
    );

  const byKey = (operations: UserDataOperation[]) =>
    Object.fromEntries(operations.map((op) => [`${op.table}.${op.column}.${op.action}`, op]));

  describe('plan', () => {
    it('reports the rows of every column and changes nothing', async () => {
      await seedUser(TARGET);
      await seedUser(OTHER);
      await seedMentions(TARGET, OTHER);
      const before = await tableTotals();
      const repo = new UserDataRepository(db.client);

      const operations = await repo.plan(TARGET);

      expect(await tableTotals()).toEqual(before);
      const ops = byKey(operations);
      for (const entry of SEEDED) {
        if (entry.action === 'keep') {
          // Not a Discord user ID: nothing is counted for it.
          expect(
            Object.keys(ops).filter((name) => name.startsWith(`${key(entry)}.`)),
            key(entry),
          ).toEqual([]);
          continue;
        }
        const optedIn = entry.optIn !== undefined;
        const action = optedIn ? 'keep' : entry.action;
        const op = ops[`${key(entry)}.${action}`];
        expect(op, key(entry)).toBeDefined();
        expect(op!.rows, key(entry)).toBe(1);
        if (optedIn) expect(op!.optIn).toBe(entry.optIn);
      }
      for (const child of USER_CHILD_DATA) {
        expect(ops[`${child.table}.${child.column}.delete`]?.rows, child.table).toBe(1);
      }
      // The ID in JSON: the ledger side of a transfer and the audit entry. The case metadata is
      // moderation data, so it is left out until --include-moderation.
      expect(ops['economy_transactions.metadata.scrub']?.rows).toBe(1);
      expect(ops['audit_logs.details.scrub']?.rows).toBe(1);
      expect(ops['moderation_cases.metadata.scrub']).toBeUndefined();
    });

    it('lists the same operations apply then performs', async () => {
      await seedUser(TARGET);
      await seedUser(OTHER);
      await seedMentions(TARGET, OTHER);
      const repo = new UserDataRepository(db.client);

      const planned = await repo.plan(TARGET, { includeModeration: true });
      const applied = await repo.erase(TARGET, { includeModeration: true }, NOW);

      expect(applied).toEqual(planned);
    });

    it('prints zeros for a user the database has never seen', async () => {
      await seedUser(OTHER);
      const repo = new UserDataRepository(db.client);

      const operations = await repo.plan(TARGET);

      expect(operations.length).toBeGreaterThan(0);
      expect(operations.every((op) => op.rows === 0)).toBe(true);
      expect(operations.some((op) => op.action === 'cancel')).toBe(false);
    });

    it('rejects anything that is not a Discord user ID', async () => {
      const repo = new UserDataRepository(db.client);
      for (const bad of ['', '42', 'abc', "1' OR '1'='1", '1000000000000000420000']) {
        await expect(repo.plan(bad)).rejects.toBeInstanceOf(ValidationError);
        await expect(repo.erase(bad)).rejects.toBeInstanceOf(ValidationError);
      }
    });
  });

  describe('erase', () => {
    it('deletes, tombstones or keeps every inventoried column, as the inventory says', async () => {
      await seedUser(TARGET);
      await seedUser(OTHER);
      const totals = await tableTotals();
      const repo = new UserDataRepository(db.client);

      const operations = await repo.erase(TARGET, {}, NOW);
      const ops = byKey(operations);

      for (const entry of SEEDED) {
        const t = entry.table;
        const col = entry.column;
        const holding = (value: string) => count(db.client, t, `"${col}" = ?`, [value]);
        if (entry.action === 'keep') {
          // Not a Discord user ID: not counted, not changed.
          expect(await holding(TARGET), `${key(entry)} untouched`).toBe(1);
          expect(await holding(OTHER), `${key(entry)} other`).toBe(1);
          continue;
        }
        const action = entry.optIn !== undefined ? 'keep' : entry.action;
        expect(ops[`${key(entry)}.${action}`]?.rows, key(entry)).toBe(1);
        // The other user's row is never touched.
        expect(await holding(OTHER), `${key(entry)} other`).toBe(1);
        switch (action) {
          case 'delete':
            expect(await holding(TARGET), `${key(entry)} deleted`).toBe(0);
            expect(await holding(MARKER), `${key(entry)} marker`).toBe(0);
            expect(await count(db.client, t), `${key(entry)} total`).toBe(totals[t]! - 1);
            break;
          case 'tombstone':
            expect(await holding(TARGET), `${key(entry)} tombstoned`).toBe(0);
            expect(await holding(MARKER), `${key(entry)} marker`).toBe(1);
            // The row stays.
            expect(await count(db.client, t), `${key(entry)} total`).toBe(
              totals[t]! -
                (USER_DATA_INVENTORY.some(
                  (e) =>
                    e.table === t &&
                    e.action === 'delete' &&
                    e.optIn === undefined &&
                    e.column !== col,
                )
                  ? 1
                  : 0),
            );
            break;
          case 'keep':
            expect(await holding(TARGET), `${key(entry)} kept`).toBe(1);
            expect(await holding(MARKER), `${key(entry)} marker`).toBe(0);
            break;
        }
      }
      for (const child of USER_CHILD_DATA) {
        expect(ops[`${child.table}.${child.column}.delete`]?.rows, child.table).toBe(1);
        expect(await count(db.client, child.table), child.table).toBe(1);
        const left = await query<{ ref: string }>(
          db.client,
          `SELECT "${child.column}" AS ref FROM "${child.table}"`,
        );
        expect(left.map((r) => r.ref)).toEqual([parentId(child.parentTable, OTHER)]);
      }
    });

    it('also removes the user from moderation records with includeModeration', async () => {
      await seedUser(TARGET);
      await seedUser(OTHER);
      await seedMentions(TARGET, OTHER);
      const repo = new UserDataRepository(db.client);

      const ops = byKey(await repo.erase(TARGET, { includeModeration: true }, NOW));

      expect(ops['moderation_cases.target_user_id.tombstone']?.rows).toBe(1);
      expect(ops['moderation_notes.target_user_id.delete']?.rows).toBe(1);
      expect(ops['moderation_warnings.user_id.delete']?.rows).toBe(1);
      expect(ops['moderation_cases.metadata.scrub']?.rows).toBe(1);
      expect(await count(db.client, 'moderation_cases', `"target_user_id" = ?`, [TARGET])).toBe(0);
      expect(await count(db.client, 'moderation_cases', `"target_user_id" = ?`, [MARKER])).toBe(1);
      expect(await count(db.client, 'moderation_notes', `"target_user_id" = ?`, [TARGET])).toBe(0);
      expect(await count(db.client, 'moderation_warnings', `"user_id" = ?`, [TARGET])).toBe(0);
      const mentioned = (
        await query<{ metadata: unknown }>(
          db.client,
          `SELECT metadata FROM moderation_cases WHERE "target_user_id" = ?`,
          [OTHER],
        )
      ).map((row) => asText(row.metadata));
      expect(mentioned.some((text) => text.includes(MARKER))).toBe(true);
      expect(mentioned.some((text) => text.includes(TARGET))).toBe(false);
    });

    it('keeps moderation records and their JSON by default', async () => {
      await seedUser(TARGET);
      await seedMentions(TARGET, OTHER);
      const repo = new UserDataRepository(db.client);

      await repo.erase(TARGET, {}, NOW);

      expect(await count(db.client, 'moderation_cases', `"target_user_id" = ?`, [TARGET])).toBe(1);
      expect(await count(db.client, 'moderation_notes', `"target_user_id" = ?`, [TARGET])).toBe(1);
      expect(await count(db.client, 'moderation_warnings', `"user_id" = ?`, [TARGET])).toBe(1);
      const [mentioned] = await query<{ metadata: unknown }>(
        db.client,
        `SELECT metadata FROM moderation_cases WHERE "target_user_id" = ?`,
        [OTHER],
      );
      expect(asText(mentioned?.metadata)).toContain(TARGET);
    });

    it('replaces the ID in the JSON of other rows, in values and arrays, and leaves the rest', async () => {
      await seedUser(OTHER);
      await seedMentions(TARGET, OTHER);
      const repo = new UserDataRepository(db.client);

      const ops = byKey(await repo.erase(TARGET, {}, NOW));

      expect(ops['economy_transactions.metadata.scrub']?.rows).toBe(1);
      expect(ops['audit_logs.details.scrub']?.rows).toBe(1);
      const ledgerRows = await query<{ metadata: unknown }>(
        db.client,
        `SELECT metadata FROM economy_transactions WHERE "user_id" = ?`,
        [OTHER],
      );
      const ledger = ledgerRows.find((row) => asText(row.metadata).includes('keep me'));
      expect(JSON.parse(asText(ledger?.metadata))).toEqual({
        senderId: MARKER,
        direction: 'CREDIT',
        note: 'keep me',
      });
      const [audit] = await query<{ details: unknown }>(
        db.client,
        `SELECT details FROM audit_logs WHERE "action" = ?`,
        ['giveaway.end'],
      );
      expect(JSON.parse(asText(audit?.details))).toEqual({
        winnerIds: [MARKER, OTHER],
        userId: MARKER,
      });
    });

    it('clears the IP address and browser of the audit entries the user made', async () => {
      await seedUser(TARGET);
      const repo = new UserDataRepository(db.client);

      await repo.erase(TARGET, {}, NOW);

      const rows = await query<{
        actor_user_id: string;
        ip_address: string | null;
        user_agent: string | null;
      }>(db.client, `SELECT actor_user_id, ip_address, user_agent FROM audit_logs`);
      expect(rows).toEqual([{ actor_user_id: MARKER, ip_address: null, user_agent: null }]);
    });

    it('is safe to run twice: the second run changes nothing', async () => {
      await seedUser(TARGET);
      await seedUser(OTHER);
      await seedMentions(TARGET, OTHER);
      const repo = new UserDataRepository(db.client);

      const first = await repo.erase(TARGET, { includeModeration: true }, NOW);
      const afterFirst = await tableTotals();
      const second = await repo.erase(TARGET, { includeModeration: true }, NOW);

      expect(first.some((op) => op.action !== 'keep' && op.rows > 0)).toBe(true);
      expect(second.filter((op) => op.rows > 0)).toEqual([]);
      expect(await tableTotals()).toEqual(afterFirst);
      // And a plan afterwards shows nothing left to do.
      expect(
        (await repo.plan(TARGET, { includeModeration: true })).filter((op) => op.rows > 0),
      ).toEqual([]);
    });

    it('does not touch the other users', async () => {
      await seedUser(OTHER);
      await seedMentions(OTHER, OTHER);
      const snapshot = async () =>
        Object.fromEntries(
          await Promise.all(
            USER_DATA_INVENTORY.map(
              async (e) =>
                [
                  key(e),
                  await query<Row>(db.client, `SELECT * FROM "${e.table}" ORDER BY 1`),
                ] as const,
            ),
          ),
        );
      const before = JSON.stringify(await snapshot(), (_k, v) =>
        typeof v === 'bigint' ? `${v}` : v,
      );
      const repo = new UserDataRepository(db.client);

      await repo.erase(TARGET, { includeModeration: true }, NOW);

      expect(
        JSON.stringify(await snapshot(), (_k, v) => (typeof v === 'bigint' ? `${v}` : v)),
      ).toBe(before);
    });

    it('cancels pending trades and unlocks the cards of the other party', async () => {
      const cards = table('user_cards');
      const trades = table('card_trades');
      const [mine, theirs, free] = ['mine', 'theirs', 'free'].map((n) => uuidOf(`card:${n}`)) as [
        string,
        string,
        string,
      ];
      await insert(db.client, cards, [
        fixture(cards, { id: mine, user_id: TARGET, state: 'IN_TRADE' }, 'card-mine'),
        fixture(cards, { id: theirs, user_id: OTHER, state: 'IN_TRADE' }, 'card-theirs'),
        fixture(cards, { id: free, user_id: OTHER, state: 'IN_TRADE' }, 'card-free'),
      ]);
      const pending = uuidOf('trade:pending');
      const done = uuidOf('trade:done');
      const unrelated = uuidOf('trade:unrelated');
      await insert(db.client, trades, [
        fixture(
          trades,
          {
            id: pending,
            sender_user_id: TARGET,
            receiver_user_id: OTHER,
            offered_card_ids: [mine],
            requested_card_ids: [theirs],
            status: 'PENDING',
          },
          'trade-pending',
        ),
        fixture(
          trades,
          { id: done, sender_user_id: OTHER, receiver_user_id: TARGET, status: 'ACCEPTED' },
          'trade-done',
        ),
        fixture(
          trades,
          {
            id: unrelated,
            sender_user_id: OTHER,
            receiver_user_id: OTHER,
            offered_card_ids: [free],
            status: 'PENDING',
          },
          'trade-unrelated',
        ),
      ]);
      const repo = new UserDataRepository(db.client);

      const planned = await repo.plan(TARGET);
      const applied = byKey(await repo.erase(TARGET, {}, NOW));

      expect(planned.find((op) => op.action === 'cancel')?.rows).toBe(1);
      expect(applied['card_trades.status.cancel']?.rows).toBe(1);
      const state = async (id: string) =>
        (
          await query<{ state: string }>(db.client, `SELECT state FROM user_cards WHERE id = ?`, [
            id,
          ])
        )[0]?.state;
      expect(await state(mine)).toBeUndefined();
      expect(await state(theirs)).toBe('IDLE');
      expect(await state(free)).toBe('IN_TRADE');
      const rows = await query<{
        id: string;
        status: string;
        sender_user_id: string;
        resolved_at: unknown;
      }>(
        db.client,
        `SELECT id, status, sender_user_id, resolved_at FROM card_trades WHERE id = ?`,
        [pending],
      );
      expect(rows[0]?.status).toBe('CANCELLED');
      expect(rows[0]?.sender_user_id).toBe(MARKER);
      expect(rows[0]?.resolved_at).not.toBeNull();
      expect(
        (
          await query<{ status: string }>(
            db.client,
            `SELECT status FROM card_trades WHERE id = ?`,
            [unrelated],
          )
        )[0]?.status,
      ).toBe('PENDING');
    });

    it('deletes a guild the user leads alone and anonymises the leader of a guild with members', async () => {
      const guilds = table('waifu_guilds');
      const members = table('waifu_guild_members');
      const [alone, shared, others] = ['alone', 'shared', 'others'].map((n) =>
        uuidOf(`wg:${n}`),
      ) as [string, string, string];
      await insert(db.client, guilds, [
        fixture(guilds, { id: alone, leader_user_id: TARGET, name: 'Alone' }, 'wg-alone'),
        fixture(guilds, { id: shared, leader_user_id: TARGET, name: 'Shared' }, 'wg-shared'),
        fixture(guilds, { id: others, leader_user_id: OTHER, name: 'Others' }, 'wg-others'),
      ]);
      await insert(db.client, members, [
        fixture(members, { guild_id: alone, user_id: TARGET }, 'm1'),
        fixture(members, { guild_id: shared, user_id: TARGET }, 'm2'),
        fixture(members, { guild_id: shared, user_id: OTHER }, 'm3'),
        fixture(members, { guild_id: others, user_id: OTHER }, 'm4'),
      ]);
      const repo = new UserDataRepository(db.client);

      const planned = byKey(await repo.plan(TARGET));
      const applied = byKey(await repo.erase(TARGET, {}, NOW));

      expect(planned['waifu_guilds.leader_user_id.delete']?.rows).toBe(1);
      expect(planned['waifu_guilds.leader_user_id.tombstone']?.rows).toBe(1);
      expect(applied['waifu_guilds.leader_user_id.delete']?.rows).toBe(1);
      expect(applied['waifu_guilds.leader_user_id.tombstone']?.rows).toBe(1);
      const left = await query<{ name: string; leader_user_id: string }>(
        db.client,
        `SELECT name, leader_user_id FROM waifu_guilds ORDER BY name`,
      );
      expect(left).toEqual([
        { name: 'Others', leader_user_id: OTHER },
        { name: 'Shared', leader_user_id: MARKER },
      ]);
      expect(await count(db.client, 'waifu_guild_members')).toBe(2);
    });

    it('rolls everything back when one statement fails', async () => {
      await seedUser(TARGET);
      await seedMentions(TARGET, OTHER);
      const before = await tableTotals();
      const markerRows = () => count(db.client, 'economy_transactions', `"user_id" = ?`, [TARGET]);
      expect(await markerRows()).toBe(1);
      if (db.dialect === 'sqlite') {
        await exec(
          db.client,
          `CREATE TRIGGER block_users BEFORE DELETE ON users BEGIN SELECT RAISE(ABORT, 'blocked'); END`,
        );
      } else {
        await exec(
          db.client,
          `CREATE FUNCTION block_delete() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'blocked'; END $$ LANGUAGE plpgsql`,
        );
        await exec(
          db.client,
          `CREATE TRIGGER block_users BEFORE DELETE ON users FOR EACH ROW EXECUTE FUNCTION block_delete()`,
        );
      }
      const repo = new UserDataRepository(db.client);

      await expect(repo.erase(TARGET, { includeModeration: true }, NOW)).rejects.toThrow();

      expect(await tableTotals()).toEqual(before);
      // The deletes that ran before the failing one were rolled back too.
      expect(await markerRows()).toBe(1);
      expect(await count(db.client, 'xp_events', `"user_id" = ?`, [TARGET])).toBe(1);
      expect(await count(db.client, 'audit_logs', `"actor_user_id" = ?`, [MARKER])).toBe(0);
    });
  });
});

describe('UserDataRepository', () => {
  it('is exported with the inventory', () => {
    expect(typeof UserDataRepository).toBe('function');
    expect(USER_DATA_INVENTORY.length).toBeGreaterThan(50);
  });
});
