import { describe, expect, it } from 'vitest';
import { is, Table } from 'drizzle-orm';
import { getTableConfig as getPgConfig, pgTable, text as pgText } from 'drizzle-orm/pg-core';
import {
  getTableConfig as getSqliteConfig,
  sqliteTable,
  text as sqliteText,
} from 'drizzle-orm/sqlite-core';
import * as pgSchema from '../schema/pg/index.js';
import * as sqliteSchema from '../schema/sqlite/index.js';
import {
  TOMBSTONE_PREFIX,
  USER_CHILD_DATA,
  USER_DATA_INVENTORY,
  USER_HASH_LENGTH,
  USER_ID_COLUMN_PATTERN,
  USER_TEXT_DATA,
  erasedMarker,
  userHash,
  type UserDataEntry,
} from './user-data-inventory.js';

interface ColumnInfo {
  name: string;
  notNull: boolean;
  type: string;
}
type TableColumns = Map<string, ColumnInfo[]>;

/** Every table of a schema module with its columns. */
function tablesOf(schema: Record<string, unknown>, dialect: 'sqlite' | 'pg'): TableColumns {
  const tables: TableColumns = new Map();
  for (const value of Object.values(schema)) {
    if (!is(value, Table)) continue;
    const config =
      dialect === 'sqlite'
        ? getSqliteConfig(value as Parameters<typeof getSqliteConfig>[0])
        : getPgConfig(value as Parameters<typeof getPgConfig>[0]);
    tables.set(
      config.name,
      config.columns.map((column) => ({
        name: column.name,
        notNull: column.notNull,
        type: column.columnType,
      })),
    );
  }
  return tables;
}

const key = (table: string, column: string) => `${table}.${column}`;

/** `table.column` of the columns that look like a user ID and that `inventory` does not list. */
function missingFromInventory(
  tables: TableColumns,
  inventory: readonly UserDataEntry[] = USER_DATA_INVENTORY,
): string[] {
  const listed = new Set(inventory.map((entry) => key(entry.table, entry.column)));
  return [...tables]
    .flatMap(([table, columns]) =>
      columns
        .filter((column) => USER_ID_COLUMN_PATTERN.test(column.name))
        .map((column) => key(table, column.name)),
    )
    .filter((name) => !listed.has(name))
    .sort();
}

const dialects = [
  ['sqlite', tablesOf(sqliteSchema, 'sqlite')],
  ['pg', tablesOf(pgSchema, 'pg')],
] as const;

describe('USER_DATA_INVENTORY', () => {
  it.each(dialects)('lists every %s column that looks like a user ID', (_dialect, tables) => {
    expect(missingFromInventory(tables)).toEqual([]);
  });

  it('fails for a column that is missing from the inventory', () => {
    const [, tables] = dialects[0];
    const without = USER_DATA_INVENTORY.filter(
      (entry) => key(entry.table, entry.column) !== 'giveaways.created_by',
    );
    expect(missingFromInventory(tables, without)).toEqual(['giveaways.created_by']);
  });

  it('fails for a new user_id, _by or owner_id column on any table, on either dialect', () => {
    const sqliteNew = sqliteTable('brand_new_things', {
      userId: sqliteText('user_id'),
      approvedBy: sqliteText('approved_by'),
      ownerId: sqliteText('owner_id'),
      note: sqliteText('note'),
    });
    const pgNew = pgTable('brand_new_things', {
      userId: pgText('user_id'),
      approvedBy: pgText('approved_by'),
      ownerId: pgText('owner_id'),
      note: pgText('note'),
    });
    const expected = [
      'brand_new_things.approved_by',
      'brand_new_things.owner_id',
      'brand_new_things.user_id',
    ];

    expect(missingFromInventory(tablesOf({ ...sqliteSchema, sqliteNew }, 'sqlite'))).toEqual(
      expected,
    );
    expect(missingFromInventory(tablesOf({ ...pgSchema, pgNew }, 'pg'))).toEqual(expected);
  });

  it('lists each column once, sorted, and only columns that exist on both dialects', () => {
    const keys = USER_DATA_INVENTORY.map((entry) => key(entry.table, entry.column));
    expect(new Set(keys).size).toBe(keys.length);
    const sorted = [...USER_DATA_INVENTORY].sort(
      (a, b) =>
        (a.table < b.table ? -1 : a.table > b.table ? 1 : 0) ||
        (a.column < b.column ? -1 : a.column > b.column ? 1 : 0),
    );
    expect(USER_DATA_INVENTORY).toEqual(sorted);
    for (const [, tables] of dialects) {
      for (const entry of USER_DATA_INVENTORY) {
        const columns = tables.get(entry.table);
        expect(columns, `${entry.table} is not a table`).toBeDefined();
        expect(
          columns?.some((c) => c.name === entry.column),
          `${entry.table}.${entry.column} is not a column`,
        ).toBe(true);
      }
    }
  });

  it('classifies every entry and explains every action that is not a plain delete', () => {
    for (const entry of USER_DATA_INVENTORY) {
      expect(['delete', 'tombstone', 'keep']).toContain(entry.action);
      if (entry.action !== 'delete' || entry.optIn !== undefined) {
        expect(entry.note, `${key(entry.table, entry.column)} needs a note`).toBeTruthy();
      }
    }
  });

  it('only tombstones and clears columns that can take the marker and a NULL', () => {
    for (const [, tables] of dialects) {
      for (const entry of USER_DATA_INVENTORY.filter((e) => e.action === 'tombstone')) {
        const columns = tables.get(entry.table) ?? [];
        const column = columns.find((c) => c.name === entry.column);
        expect(column?.type, key(entry.table, entry.column)).toMatch(/Text|Varchar/);
        for (const name of entry.clear ?? []) {
          expect(
            columns.find((c) => c.name === name)?.notNull,
            `${entry.table}.${name} must be nullable`,
          ).toBe(false);
        }
        if (entry.deleteWhenAlone) {
          const rule = entry.deleteWhenAlone;
          const other = tables.get(rule.table) ?? [];
          expect(other.some((c) => c.name === rule.column)).toBe(true);
          expect(other.some((c) => c.name === rule.userColumn)).toBe(true);
          expect(columns.some((c) => c.name === rule.parentColumn)).toBe(true);
        }
      }
    }
  });

  it('only keeps and opts in with a stated reason', () => {
    const action = (table: string, column: string) =>
      USER_DATA_INVENTORY.find((e) => e.table === table && e.column === column);
    expect(action('streamers', 'platform_user_id')?.action).toBe('keep');
    expect(action('moderation_cases', 'target_user_id')?.optIn).toBe('moderation');
    expect(action('moderation_notes', 'target_user_id')?.optIn).toBe('moderation');
    expect(action('moderation_warnings', 'user_id')?.optIn).toBe('moderation');
    // The moderator side of a case is never opt-in: a case about somebody else stays complete.
    expect(action('moderation_cases', 'moderator_user_id')?.optIn).toBeUndefined();
  });

  it('deletes the rows the owner holds alone and tombstones the shared ones', () => {
    const action = (table: string, column: string) =>
      USER_DATA_INVENTORY.find((e) => e.table === table && e.column === column)?.action;
    for (const [table, column] of [
      ['ai_conversations', 'user_id'],
      ['ai_user_preferences', 'user_id'],
      ['user_consents', 'user_id'],
      ['economy_balances', 'user_id'],
      ['user_inventory_items', 'user_id'],
      ['user_cards', 'user_id'],
      ['xp_accounts', 'user_id'],
      ['reminders', 'user_id'],
      ['music_history', 'user_id'],
      ['image_jobs', 'user_id'],
      ['web_sessions', 'user_id'],
      ['web_passkeys', 'user_id'],
      ['web_known_devices', 'user_id'],
      ['users', 'id'],
    ] as const) {
      expect(action(table, column), key(table, column)).toBe('delete');
    }
    for (const [table, column] of [
      ['economy_transactions', 'user_id'],
      ['card_trades', 'sender_user_id'],
      ['card_trades', 'receiver_user_id'],
      ['giveaway_winners', 'user_id'],
      ['moderation_cases', 'moderator_user_id'],
    ] as const) {
      expect(action(table, column), key(table, column)).toBe('tombstone');
    }
  });
});

describe('USER_CHILD_DATA', () => {
  it.each(dialects)('names real %s tables and columns with a deleted parent', (_d, tables) => {
    for (const child of USER_CHILD_DATA) {
      const childColumns = tables.get(child.table);
      const parentColumns = tables.get(child.parentTable);
      expect(
        childColumns?.some((c) => c.name === child.column),
        child.table,
      ).toBe(true);
      expect(
        parentColumns?.some((c) => c.name === child.parentColumn),
        child.parentTable,
      ).toBe(true);
      // A child has no user column of its own: it follows a parent that the erasure deletes.
      expect(
        childColumns?.some((c) => USER_ID_COLUMN_PATTERN.test(c.name)),
        child.table,
      ).toBe(false);
      const parent = USER_DATA_INVENTORY.find(
        (e) => e.table === child.parentTable && e.column === child.parentUserColumn,
      );
      expect(parent?.action, child.parentTable).toBe('delete');
    }
  });
});

describe('USER_TEXT_DATA', () => {
  it.each(dialects)('names real %s columns that hold JSON', (_d, tables) => {
    for (const entry of USER_TEXT_DATA) {
      const column = tables.get(entry.table)?.find((c) => c.name === entry.column);
      expect(column, key(entry.table, entry.column)).toBeDefined();
      expect(column?.type, key(entry.table, entry.column)).toMatch(/Json|Text/);
    }
  });
});

describe('erasedMarker', () => {
  it('is erased: and 16 hex digits of the SHA-256, short enough for varchar(32)', () => {
    const marker = erasedMarker('100000000000000042');
    expect(marker).toMatch(/^erased:[0-9a-f]{16}$/);
    expect(marker.startsWith(TOMBSTONE_PREFIX)).toBe(true);
    expect(marker.length).toBe(TOMBSTONE_PREFIX.length + USER_HASH_LENGTH);
    expect(marker.length).toBeLessThanOrEqual(32);
    expect(marker).not.toContain('100000000000000042');
  });

  it('is stable, differs per user, and matches userHash', () => {
    expect(erasedMarker('100000000000000042')).toBe(erasedMarker('100000000000000042'));
    expect(erasedMarker('100000000000000042')).not.toBe(erasedMarker('100000000000000043'));
    expect(erasedMarker('100000000000000042')).toBe(`erased:${userHash('100000000000000042')}`);
  });
});
