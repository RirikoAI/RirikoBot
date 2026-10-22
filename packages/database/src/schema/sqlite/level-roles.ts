import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/** One level role reward: the role Ririko gives at `level`. */
export interface LevelRoleReward {
  level: number;
  roleId: string;
}

/**
 * Per-server level role settings: the roles given at chosen levels, and whether lower reward roles
 * are kept. One row per guild, created the first time it is saved. It holds role IDs only.
 */
export const levelRoleSettings = sqliteTable('level_role_settings', {
  guildId: text('guild_id').primaryKey(),
  rewards: text('rewards', { mode: 'json' }).$type<LevelRoleReward[]>().notNull().default([]),
  keepPreviousRoles: integer('keep_previous_roles', { mode: 'boolean' }).notNull().default(true),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});
