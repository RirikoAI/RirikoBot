import DatabaseConstructor from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { PG_MIGRATIONS } from './generated/pg.js';
import { SQLITE_MIGRATIONS } from './generated/sqlite.js';

const ID = '0011_items_command_settings';
const find = (list: typeof SQLITE_MIGRATIONS) => list.find((m) => m.id === ID);

describe('0011_items_command_settings', () => {
  it('is data-only and the same SQL for both dialects', () => {
    const sqlite = find(SQLITE_MIGRATIONS);
    expect(sqlite).toBeDefined();
    expect(sqlite!.contract).toBe(false);
    expect(find(PG_MIGRATIONS)!.statements).toEqual(sqlite!.statements);
    for (const statement of sqlite!.statements) expect(statement).toMatch(/UPDATE /);
  });

  it('moves /item overrides to /items and leaves /use alone', () => {
    const db = new DatabaseConstructor(':memory:');
    db.exec(`
      CREATE TABLE command_settings (id text PRIMARY KEY, guild_id text NOT NULL, command_name text NOT NULL);
      INSERT INTO command_settings VALUES ('a','g1','item'), ('b','g2','use'), ('c','g3','craft');
    `);
    for (const statement of find(SQLITE_MIGRATIONS)!.statements) db.exec(statement);
    expect(db.prepare('SELECT id, command_name FROM command_settings ORDER BY id').all()).toEqual([
      { id: 'a', command_name: 'items' },
      { id: 'b', command_name: 'use' },
      { id: 'c', command_name: 'craft' },
    ]);
  });
});
