// Embeds the SQL migrations in migrations/{sqlite,pg}/ as TypeScript modules, so the bot, the CLI
// and the dashboard bundle read no migration files at runtime (docs/adr/ADR-015):
//   src/migrations/generated/sqlite.ts (SQLITE_MIGRATIONS) and pg.ts (PG_MIGRATIONS).
// Run it after drizzle-kit generate: pnpm -F @ririko/database db:generate-migrations
//
// Each entry is { id, statements, checksum, contract }:
//   id          the file name without ".sql", for example "0000_baseline"
//   statements  the file split on drizzle's "--> statement-breakpoint" (never on ";")
//   checksum    sha256 of the file bytes with CRLF normalised to LF, so Windows and Linux agree
//   contract    true when the first line is "-- ririko:contract"
// The output is deterministic: running it twice changes nothing.
/* global console */
import { writeFileSync } from 'node:fs';
import { URL } from 'node:url';
import { DIALECTS, readMigrations, renderMigrationsModule } from './migration-files.mjs';

for (const { dir, exportName, label } of DIALECTS) {
  const migrations = readMigrations(dir);
  writeFileSync(
    new URL(`../src/migrations/generated/${dir}.ts`, import.meta.url),
    renderMigrationsModule(label, exportName, migrations),
  );
  console.log(`${exportName} regenerated (${migrations.length} migration(s)).`);
}
