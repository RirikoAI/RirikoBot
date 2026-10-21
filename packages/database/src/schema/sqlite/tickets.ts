import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

/** Per-server support ticket settings. One row per guild, created the first time it is saved. */
export const ticketSettings = sqliteTable('ticket_settings', {
  guildId: text('guild_id').primaryKey(),
  isEnabled: integer('is_enabled', { mode: 'boolean' }).notNull().default(false),
  categoryId: text('category_id'),
  staffRoleIds: text('staff_role_ids', { mode: 'json' }).$type<string[]>().notNull().default([]),
  transcriptChannelId: text('transcript_channel_id'),
  maxOpenPerUser: integer('max_open_per_user').notNull().default(1),
  welcomeMessage: text('welcome_message'),
  /** The number the next ticket in this server gets. Incremented in the transaction that opens one. */
  nextNumber: integer('next_number').notNull().default(1),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

/** A support ticket: one private channel. `status` is `open` or `closed`. */
export const tickets = sqliteTable(
  'tickets',
  {
    id: text('id').primaryKey(),
    guildId: text('guild_id').notNull(),
    number: integer('number').notNull(),
    channelId: text('channel_id').notNull(),
    openerId: text('opener_id').notNull(),
    subject: text('subject'),
    status: text('status', { enum: ['open', 'closed'] })
      .notNull()
      .default('open'),
    claimedBy: text('claimed_by'),
    closedBy: text('closed_by'),
    closeReason: text('close_reason'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    closedAt: integer('closed_at', { mode: 'timestamp_ms' }),
  },
  (table) => [
    uniqueIndex('uq_tickets_guild_number').on(table.guildId, table.number),
    uniqueIndex('uq_tickets_channel').on(table.channelId),
    index('idx_tickets_guild_opener_status').on(table.guildId, table.openerId, table.status),
  ],
);
