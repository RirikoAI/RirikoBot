import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  integer,
  bigint,
  boolean,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';

export const adventureSettings = pgTable('adventure_settings', {
  guildId: text('guild_id').primaryKey(),
  energyEnabled: boolean('energy_enabled').notNull().default(true),
});

export const adventurePlayers = pgTable('adventure_players', {
  userId: text('user_id').primaryKey(),
  lastStartAt: bigint('last_start_at', { mode: 'number' }).notNull().default(0),
  cooldownUntil: bigint('cooldown_until', { mode: 'number' }).notNull().default(0),
});
export const adventureSessions = pgTable(
  'adventure_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    guildId: text('guild_id').notNull(),
    channelId: text('channel_id').notNull(),
    revision: integer('revision').notNull(),
    deliveredRevision: integer('delivered_revision').notNull().default(-1),
    status: text('status').notNull(),
    deadline: bigint('deadline', { mode: 'number' }).notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
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
export const adventureChoices = pgTable(
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
