// Regenerates src/schema/sqlite/ddl.ts from the Drizzle SQLite schema.
// SQLITE_SCHEMA_DDL bootstraps empty SQLite databases, so run this after every sqlite schema change:
//   pnpm -F @ririko/database db:generate-ddl
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const sql = execSync(
  'pnpm exec drizzle-kit export --dialect sqlite --schema ./src/schema/sqlite/index.ts',
  {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  },
).trim();

if (!sql.includes('CREATE TABLE')) throw new Error('drizzle-kit export returned no DDL');

writeFileSync(
  new URL('../src/schema/sqlite/ddl.ts', import.meta.url),
  `// Auto-generated SQLite schema DDL (pnpm -F @ririko/database db:generate-ddl)\nexport const SQLITE_SCHEMA_DDL =\n  ${JSON.stringify(sql)};\n`,
);
console.log(`SQLITE_SCHEMA_DDL regenerated (${sql.match(/CREATE TABLE/g).length} tables).`);
