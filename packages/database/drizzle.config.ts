import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/schema/sqlite/index.ts',
  dbCredentials: {
    url: process.env.DATABASE_URL || '../../data/ririko.sqlite',
  },
});
