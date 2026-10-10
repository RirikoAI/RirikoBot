// Runs `drizzle-kit generate` for both dialects, writing the SQL migrations and drizzle-kit's
// meta snapshots to migrations/sqlite and migrations/pg. Afterwards run the embedder
// (db:generate-migrations); the root `pnpm db:generate` runs both.
//
//   pnpm -F @ririko/database db:generate-sql [--name <migration name>]
//
// With no changes to a schema drizzle-kit writes nothing. Review the generated SQL before
// committing it; committed migrations are never edited (docs/adr/ADR-015).
/* global console, process */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const nameIndex = args.indexOf('--name');
const name = nameIndex >= 0 ? args[nameIndex + 1] : undefined;
if (nameIndex >= 0 && !name) throw new Error('--name needs a value');

function sqlFiles(dir) {
  const path = fileURLToPath(new URL(`../migrations/${dir}/`, import.meta.url));
  return existsSync(path) ? readdirSync(path).filter((file) => file.endsWith('.sql')) : [];
}

for (const [dialect, config, dir] of [
  ['SQLite', './drizzle.sqlite.config.ts', 'sqlite'],
  ['PostgreSQL', './drizzle.pg.config.ts', 'pg'],
]) {
  console.log(`drizzle-kit generate (${dialect})`);
  const before = new Set(sqlFiles(dir));
  // Drizzle Kit's snapshot serializer needs JSON-safe bigint defaults; patch only this child.
  const argv = ['node', 'drizzle-kit', 'generate', '--config', config];
  if (name) argv.push('--name', name);
  const script = `
    BigInt.prototype.toJSON = function () { return this.toString(); };
    process.argv = ${JSON.stringify(argv)};
    require('./node_modules/drizzle-kit/bin.cjs');
  `;
  execFileSync(process.execPath, ['-e', script], { cwd: root, stdio: 'inherit' });

  // Like the bootstrap DDL, a PostgreSQL migration uses unqualified names, so it builds the schema
  // in the connection's search_path instead of a fixed "public". Only new files are touched.
  if (dir === 'pg') {
    for (const file of sqlFiles(dir).filter((candidate) => !before.has(candidate))) {
      const path = new URL(`../migrations/${dir}/${file}`, import.meta.url);
      writeFileSync(path, readFileSync(path, 'utf8').replaceAll('"public".', ''));
    }
  }
}
