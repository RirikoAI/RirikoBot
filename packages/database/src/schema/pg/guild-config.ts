import { pgTable, varchar, integer, timestamp, index, primaryKey } from 'drizzle-orm/pg-core';

/**
 * Change feed for guild settings written outside the bot process (dashboard, CLI). Writers bump
 * the version in the same transaction as the settings write; the bot polls recent rows and
 * evicts its caches.
 */
export const guildConfigVersions = pgTable(
  'guild_config_versions',
  {
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    module: varchar('module', { length: 64 }).notNull(),
    version: integer('version').notNull().default(1),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.guildId, table.module] }),
    index('idx_pg_guild_config_versions_updated').on(table.updatedAt),
  ],
);
