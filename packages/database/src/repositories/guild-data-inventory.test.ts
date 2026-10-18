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
  GUILD_CHILD_DATA,
  GUILD_DATA_INVENTORY,
  GUILD_ID_COLUMN,
  type GuildDataEntry,
} from './guild-data-inventory.js';

interface ColumnInfo {
  name: string;
  notNull: boolean;
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
      config.columns.map((column) => ({ name: column.name, notNull: column.notNull })),
    );
  }
  return tables;
}

/** Names of the tables with a `guild_id` column that `inventory` does not list. */
function missingFromInventory(
  tables: TableColumns,
  inventory: readonly GuildDataEntry[] = GUILD_DATA_INVENTORY,
): string[] {
  const listed = new Set(inventory.map((entry) => entry.table));
  return [...tables]
    .filter(
      ([name, columns]) => columns.some((c) => c.name === GUILD_ID_COLUMN) && !listed.has(name),
    )
    .map(([name]) => name)
    .sort();
}

const dialects = [
  ['sqlite', tablesOf(sqliteSchema, 'sqlite')],
  ['pg', tablesOf(pgSchema, 'pg')],
] as const;

describe('GUILD_DATA_INVENTORY', () => {
  it.each(dialects)('lists every %s table that has a guild_id column', (_dialect, tables) => {
    expect(missingFromInventory(tables)).toEqual([]);
  });

  it('fails for a table that is missing from the inventory', () => {
    const [, tables] = dialects[0];
    const withoutXp = GUILD_DATA_INVENTORY.filter((entry) => entry.table !== 'xp_events');
    expect(missingFromInventory(tables, withoutXp)).toEqual(['xp_events']);
  });

  it('fails for a new table with a guild_id column, on either dialect', () => {
    const sqliteNew = sqliteTable('brand_new_things', { guildId: sqliteText('guild_id') });
    const pgNew = pgTable('brand_new_things', { guildId: pgText('guild_id') });
    const sqliteTables = tablesOf({ ...sqliteSchema, sqliteNew }, 'sqlite');
    const pgTables = tablesOf({ ...pgSchema, pgNew }, 'pg');

    expect(missingFromInventory(sqliteTables)).toEqual(['brand_new_things']);
    expect(missingFromInventory(pgTables)).toEqual(['brand_new_things']);
  });

  it('lists each table once, sorted, and only tables that exist on both dialects', () => {
    const names = GUILD_DATA_INVENTORY.map((entry) => entry.table);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual([...names].sort());
    for (const [, tables] of dialects) {
      for (const entry of GUILD_DATA_INVENTORY) {
        const columns = tables.get(entry.table);
        expect(columns, `${entry.table} is not a table`).toBeDefined();
        expect(
          columns?.some((c) => c.name === GUILD_ID_COLUMN),
          `${entry.table} has no ${GUILD_ID_COLUMN} column`,
        ).toBe(true);
      }
    }
  });

  it('only detaches tables whose guild_id may be null', () => {
    for (const [, tables] of dialects) {
      for (const entry of GUILD_DATA_INVENTORY.filter((e) => e.action === 'detach')) {
        const column = tables.get(entry.table)?.find((c) => c.name === GUILD_ID_COLUMN);
        expect(column?.notNull, `${entry.table}.guild_id must be nullable`).toBe(false);
      }
    }
  });

  it('explains every action that is not a plain delete', () => {
    for (const entry of GUILD_DATA_INVENTORY.filter((e) => e.action !== 'delete')) {
      expect(entry.note, `${entry.table} needs a note`).toBeTruthy();
    }
  });

  it('keeps the three user-owned tables and the WaifuGuild table out of the delete', () => {
    const action = (table: string) => GUILD_DATA_INVENTORY.find((e) => e.table === table)?.action;
    expect(action('economy_transactions')).toBe('detach');
    expect(action('reminders')).toBe('detach');
    expect(action('music_saved_playlists')).toBe('detach');
    expect(action('waifu_guild_members')).toBe('exclude');
  });
});

describe('GUILD_CHILD_DATA', () => {
  it.each(dialects)(
    'names real %s tables and columns, with an inventoried parent',
    (_d, tables) => {
      const inventoried = new Map(GUILD_DATA_INVENTORY.map((entry) => [entry.table, entry.action]));
      for (const child of GUILD_CHILD_DATA) {
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
        // A child has no guild_id of its own and follows a parent that the purge deletes.
        expect(
          childColumns?.some((c) => c.name === GUILD_ID_COLUMN),
          child.table,
        ).toBe(false);
        expect(inventoried.get(child.parentTable), child.parentTable).toBe('delete');
      }
    },
  );
});
