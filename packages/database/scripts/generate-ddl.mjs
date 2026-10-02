// Regenerates the schema DDL that bootstraps empty databases, from the Drizzle schemas:
//   src/schema/sqlite/ddl.ts (SQLITE_SCHEMA_DDL) and src/schema/pg/ddl.ts (PG_SCHEMA_DDL).
// Run it after every schema change: pnpm -F @ririko/database db:generate-ddl
/* global console, process */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

function exportDdl(dialect, schema) {
  // Drizzle Kit's snapshot serializer needs JSON-safe bigint defaults; patch only this child.
  const script = `
    BigInt.prototype.toJSON = function () { return this.toString(); };
    process.argv = ['node', 'drizzle-kit', 'export', '--dialect', '${dialect}', '--schema', '${schema}'];
    require('./node_modules/drizzle-kit/bin.cjs');
  `;
  const sql = execFileSync(process.execPath, ['-e', script], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }).trim();
  if (!sql.includes('CREATE TABLE'))
    throw new Error(`drizzle-kit export returned no ${dialect} DDL`);
  return sql;
}

function write(path, name, label, sql) {
  writeFileSync(
    new URL(path, import.meta.url),
    `// Auto-generated ${label} schema DDL (pnpm -F @ririko/database db:generate-ddl)\nexport const ${name} =\n  ${JSON.stringify(sql)};\n`,
  );
  console.log(`${name} regenerated (${sql.match(/CREATE TABLE/g).length} tables).`);
}

write(
  '../src/schema/sqlite/ddl.ts',
  'SQLITE_SCHEMA_DDL',
  'SQLite',
  exportDdl('sqlite', './src/schema/sqlite/index.ts'),
);
// Unqualified names, so the DDL builds the schema in the connection's search_path.
write(
  '../src/schema/pg/ddl.ts',
  'PG_SCHEMA_DDL',
  'PostgreSQL',
  exportDdl('postgresql', './src/schema/pg/index.ts').replaceAll('"public".', ''),
);
