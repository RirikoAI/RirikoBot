import { defineConfig } from 'drizzle-kit';

// Authoring config for the PostgreSQL migrations: pnpm db:generate (see docs/database.md).
// `generate` only diffs the schema, so it needs no database credentials.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/pg/index.ts',
  out: './migrations/pg',
});
