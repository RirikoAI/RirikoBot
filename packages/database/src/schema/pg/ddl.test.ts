import { describe, it, expect } from 'vitest';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import * as pgSchema from './index.js';
import { PG_SCHEMA_DDL } from './ddl.js';

describe('PG_SCHEMA_DDL parity with the Drizzle PostgreSQL schema', () => {
  it('creates every table and column the schema declares, in the current schema', () => {
    const tables = new Map<string, string>();
    for (const match of PG_SCHEMA_DDL.matchAll(/CREATE TABLE "([^"]+)" \(([\s\S]*?)\n\);/g)) {
      tables.set(match[1]!, match[2]!);
    }

    const missing: string[] = [];
    for (const table of Object.values(pgSchema)) {
      if (!(table instanceof PgTable)) continue;
      const config = getTableConfig(table);
      const body = tables.get(config.name);
      if (body === undefined) {
        missing.push(`table ${config.name}`);
        continue;
      }
      for (const column of config.columns) {
        if (!body.includes(`"${column.name}"`)) missing.push(`${config.name}.${column.name}`);
      }
    }

    // Fix with: pnpm -F @ririko/database db:generate-ddl
    expect(missing).toEqual([]);
    // Bootstrap builds in the connection's search_path, never a fixed schema.
    expect(PG_SCHEMA_DDL).not.toContain('"public".');
  });
});
