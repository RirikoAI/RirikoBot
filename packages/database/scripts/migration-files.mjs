// Reads the SQL migrations in migrations/{sqlite,pg}/ and renders them as the TypeScript modules
// src/migrations/generated/{sqlite,pg}.ts (docs/adr/ADR-015). Shared by the embedder
// (embed-migrations.mjs) and by `pnpm db:check` (scripts/check-migrations.ts), so the check
// rebuilds exactly what the embedder writes.
//
// Each entry is { id, statements, checksum, contract }:
//   id          the file name without ".sql", for example "0000_baseline"
//   statements  the file split on drizzle's "--> statement-breakpoint" (never on ";")
//   checksum    sha256 of the file bytes with CRLF normalised to LF, so Windows and Linux agree
//   contract    true when the first line is "-- ririko:contract"
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

export const BREAKPOINT = '--> statement-breakpoint';
export const CONTRACT_MARKER = '-- ririko:contract';
const FILE_NAME = /^(\d{4})_[a-z0-9_]+\.sql$/;

/** The two dialects: migrations folder, generated module name, export name and label. */
export const DIALECTS = [
  { dir: 'sqlite', exportName: 'SQLITE_MIGRATIONS', label: 'SQLite' },
  { dir: 'pg', exportName: 'PG_MIGRATIONS', label: 'PostgreSQL' },
];

/** The package's migrations folder (the parent of `sqlite/` and `pg/`). */
export const MIGRATIONS_ROOT = fileURLToPath(new URL('../migrations/', import.meta.url));

/** True when the first line of `text` is the contract marker. */
export function isContract(text) {
  return text.split('\n', 1)[0].trim() === CONTRACT_MARKER;
}

/**
 * The migrations of one dialect folder, in order. Throws when the files and drizzle's journal
 * disagree or a file name does not follow `NNNN_<slug>.sql`.
 */
export function readMigrations(dialectDir, root = MIGRATIONS_ROOT) {
  const dir = join(root, dialectDir);
  const journal = JSON.parse(readFileSync(join(dir, 'meta', '_journal.json'), 'utf8'));
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const tags = journal.entries.map((entry) => entry.tag);
  const names = files.map((name) => name.replace(/\.sql$/, ''));
  if (JSON.stringify(tags) !== JSON.stringify(names)) {
    throw new Error(
      `migrations/${dialectDir}: the SQL files (${names.join(', ')}) do not match drizzle's journal (${tags.join(', ')})`,
    );
  }

  return files.map((name, index) => {
    const match = FILE_NAME.exec(name);
    if (!match || Number(match[1]) !== index) {
      throw new Error(
        `migrations/${dialectDir}/${name}: expected a name like ${String(index).padStart(4, '0')}_<slug>.sql`,
      );
    }
    const text = readFileSync(join(dir, name), 'utf8').replaceAll('\r\n', '\n');
    const statements = text
      .split(BREAKPOINT)
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);
    return {
      id: name.replace(/\.sql$/, ''),
      statements,
      checksum: createHash('sha256').update(text, 'utf8').digest('hex'),
      contract: isContract(text),
    };
  });
}

/** The text of a generated module. Deterministic: the same migrations give the same text. */
export function renderMigrationsModule(label, exportName, migrations) {
  return (
    `// Auto-generated ${label} migrations (pnpm -F @ririko/database db:generate-migrations)\n` +
    `import type { EmbeddedMigration } from '../embedded.js';\n\n` +
    `export const ${exportName}: readonly EmbeddedMigration[] = ${JSON.stringify(migrations, null, 2)};\n`
  );
}
