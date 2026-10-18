import { defineConfig } from 'drizzle-kit';

// Authoring config for the SQLite migrations: pnpm db:generate (see docs/database.md).
// `drizzle.config.ts` stays the development config for `db:push`.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/schema/sqlite/index.ts',
  out: './migrations/sqlite',
});
