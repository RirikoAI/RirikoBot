import { pgTable, varchar, boolean, timestamp, jsonb } from 'drizzle-orm/pg-core';
import type { LevelRoleReward } from '../sqlite/level-roles.js';

/**
 * Per-server level role settings: the roles given at chosen levels, and whether lower reward roles
 * are kept. One row per guild, created the first time it is saved. It holds role IDs only.
 */
export const levelRoleSettings = pgTable('level_role_settings', {
  guildId: varchar('guild_id', { length: 32 }).primaryKey(),
  rewards: jsonb('rewards').$type<LevelRoleReward[]>().notNull().default([]),
  keepPreviousRoles: boolean('keep_previous_roles').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
