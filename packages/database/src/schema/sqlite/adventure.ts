import { sql } from 'drizzle-orm';
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/sqlite-core';

export const adventureSettings = sqliteTable('adventure_settings', {
  guildId: text('guild_id').primaryKey(),
  energyEnabled: integer('energy_enabled', { mode: 'boolean' }).notNull().default(true),
});

/** One durable serialization/cooldown row per Discord user, independent of guild/channel. */
export const adventurePlayers = sqliteTable('adventure_players', {
  userId: text('user_id').primaryKey(),
  lastStartAt: integer('last_start_at').notNull().default(0),
  cooldownUntil: integer('cooldown_until').notNull().default(0),
});
export const adventureSessions = sqliteTable(
  'adventure_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    guildId: text('guild_id').notNull(),
    channelId: text('channel_id').notNull(),
    revision: integer('revision').notNull(),
    deliveredRevision: integer('delivered_revision').notNull().default(-1),
    status: text('status').notNull(),
    deadline: integer('deadline').notNull(),
    createdAt: integer('created_at').notNull(),
    payload: text('payload').notNull(),
  },
  (table) => [
    uniqueIndex('idx_adventure_active_user')
      .on(table.userId)
      .where(sql`${table.status} IN ('ACTIVE', 'SETTLING')`),
    index('idx_adventure_due').on(table.status, table.deadline),
    index('idx_adventure_user_created').on(table.userId, table.createdAt),
  ],
);
export const adventureChoices = sqliteTable(
  'adventure_choices',
  {
    sessionId: text('session_id')
      .notNull()
      .references(() => adventureSessions.id),
    revision: integer('revision').notNull(),
    payload: text('payload').notNull(),
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.revision] })],
);
