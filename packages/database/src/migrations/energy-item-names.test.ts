import DatabaseConstructor from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { PG_MIGRATIONS } from './generated/pg.js';
import { SQLITE_MIGRATIONS } from './generated/sqlite.js';

const ID = '0010_energy_item_names';
const find = (list: typeof SQLITE_MIGRATIONS) => list.find((m) => m.id === ID);

function database() {
  const db = new DatabaseConstructor(':memory:');
  db.exec(`
    CREATE TABLE game_items (id text PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL);
    CREATE TABLE economy_items (id text PRIMARY KEY, code text UNIQUE, name text NOT NULL, description text NOT NULL);
    CREATE TABLE user_inventory (id text PRIMARY KEY, item_id text NOT NULL REFERENCES economy_items(id));
  `);
  return db;
}

const run = (db: ReturnType<typeof database>) => {
  for (const statement of find(SQLITE_MIGRATIONS)!.statements) db.exec(statement);
};

describe('0010_energy_item_names', () => {
  it('is data-only, needs no contract marker, and is the same SQL for both dialects', () => {
    const sqlite = find(SQLITE_MIGRATIONS);
    expect(sqlite).toBeDefined();
    expect(sqlite!.contract).toBe(false);
    expect(find(PG_MIGRATIONS)!.statements).toEqual(sqlite!.statements);
    for (const statement of sqlite!.statements) expect(statement).toMatch(/UPDATE /);
  });

  it('renames old rows, keeps ids and inventory links, and leaves owner edits alone', () => {
    const db = database();
    db.exec(`
      INSERT INTO game_items VALUES ('g1','RESTORE_STAMINA_CANDY','Stamina Candy'), ('g2','RESTORE_GRAND_STAMINA_FLASK','Owner Flask');
      INSERT INTO economy_items VALUES
        ('e1','stamina_potion','Stamina Potion','Restores 50 stamina. Hard anti-abuse ceiling: max 3 potions consumed per day.'),
        ('e2','candy_minor','Minor Energy Candy','Owner wrote this');
      INSERT INTO user_inventory VALUES ('i1','e1');
    `);
    run(db);
    expect(db.prepare('SELECT id, code, name FROM game_items ORDER BY id').all()).toEqual([
      { id: 'g1', code: 'RESTORE_ENERGY_CANDY', name: 'Energy Candy' },
      { id: 'g2', code: 'RESTORE_GRAND_ENERGY_FLASK', name: 'Owner Flask' },
    ]);
    expect(
      db.prepare('SELECT id, code, name, description FROM economy_items ORDER BY id').all(),
    ).toEqual([
      {
        id: 'e1',
        code: 'energy_potion',
        name: 'Energy Potion',
        description: 'Restores 50 energy. Hard anti-abuse ceiling: max 3 potions consumed per day.',
      },
      {
        id: 'e2',
        code: 'candy_minor',
        name: 'Minor Energy Candy',
        description: 'Owner wrote this',
      },
    ]);
    expect(db.prepare('SELECT item_id FROM user_inventory').get()).toEqual({ item_id: 'e1' });
  });

  it('does not rename a code when the new one already exists, and is a no-op on a fresh database', () => {
    const db = database();
    db.exec(`
      INSERT INTO economy_items VALUES ('e1','stamina_potion','Stamina Potion','x'), ('e2','energy_potion','Energy Potion','y');
    `);
    run(db);
    expect(db.prepare('SELECT code FROM economy_items ORDER BY id').all()).toEqual([
      { code: 'stamina_potion' },
      { code: 'energy_potion' },
    ]);
    const fresh = database();
    run(fresh);
    expect(fresh.prepare('SELECT count(*) AS n FROM economy_items').get()).toEqual({ n: 0 });
  });
});
