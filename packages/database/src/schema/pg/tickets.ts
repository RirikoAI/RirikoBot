import {
  pgTable,
  text,
  varchar,
  boolean,
  integer,
  uuid,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/** Per-server support ticket settings. One row per guild, created the first time it is saved. */
export const ticketSettings = pgTable('ticket_settings', {
  guildId: varchar('guild_id', { length: 32 }).primaryKey(),
  isEnabled: boolean('is_enabled').notNull().default(false),
  categoryId: varchar('category_id', { length: 32 }),
  staffRoleIds: jsonb('staff_role_ids').$type<string[]>().notNull().default([]),
  transcriptChannelId: varchar('transcript_channel_id', { length: 32 }),
  maxOpenPerUser: integer('max_open_per_user').notNull().default(1),
  welcomeMessage: text('welcome_message'),
  /** The number the next ticket in this server gets. Incremented in the transaction that opens one. */
  nextNumber: integer('next_number').notNull().default(1),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** A support ticket: one private channel. `status` is `open` or `closed`. */
export const tickets = pgTable(
  'tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    guildId: varchar('guild_id', { length: 32 }).notNull(),
    number: integer('number').notNull(),
    channelId: varchar('channel_id', { length: 32 }).notNull(),
    openerId: varchar('opener_id', { length: 32 }).notNull(),
    subject: text('subject'),
    status: text('status', { enum: ['open', 'closed'] })
      .notNull()
      .default('open'),
    claimedBy: varchar('claimed_by', { length: 32 }),
    closedBy: varchar('closed_by', { length: 32 }),
    closeReason: text('close_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('uq_pg_tickets_guild_number').on(table.guildId, table.number),
    uniqueIndex('uq_pg_tickets_channel').on(table.channelId),
    index('idx_pg_tickets_guild_opener_status').on(table.guildId, table.openerId, table.status),
  ],
);
