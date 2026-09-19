import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core';
import * as sqliteSchema from './index.js';
import { SQLITE_SCHEMA_DDL } from './ddl.js';

describe('SQLITE_SCHEMA_DDL parity with the Drizzle SQLite schema', () => {
  it('creates every table and column the schema declares', () => {
    const db = new Database(':memory:');
    db.exec(SQLITE_SCHEMA_DDL);

    const missing: string[] = [];
    for (const table of Object.values(sqliteSchema)) {
      if (!(table instanceof SQLiteTable)) continue;
      const config = getTableConfig(table);
      const columns = new Set(
        (db.prepare(`PRAGMA table_info(\`${config.name}\`)`).all() as Array<{ name: string }>).map(
          (c) => c.name,
        ),
      );
      if (columns.size === 0) {
        missing.push(`table ${config.name}`);
        continue;
      }
      for (const column of config.columns) {
        if (!columns.has(column.name)) missing.push(`${config.name}.${column.name}`);
      }
    }
    db.close();

    // Fix with: pnpm -F @ririko/database db:generate-ddl
    expect(missing).toEqual([]);
  });
});
