import { sqliteTable, text, integer, index, primaryKey } from 'drizzle-orm/sqlite-core';

/**
 * Change feed for guild settings written outside the bot process (dashboard, CLI). Writers bump
 * the version in the same transaction as the settings write; the bot polls recent rows and
 * evicts its caches.
 */
export const guildConfigVersions = sqliteTable(
  'guild_config_versions',
  {
    guildId: text('guild_id').notNull(),
    module: text('module').notNull(),
    version: integer('version').notNull().default(1),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.guildId, table.module] }),
    index('idx_guild_config_versions_updated').on(table.updatedAt),
  ],
);
