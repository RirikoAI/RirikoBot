import {
  pgTable,
  text,
  varchar,
  boolean,
  integer,
  bigint,
  uuid,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';

export const economyAccounts = pgTable('economy_accounts', {
  userId: varchar('user_id', { length: 32 }).primaryKey(),
  isFrozen: boolean('is_frozen').notNull().default(false),
  dailyStreak: integer('daily_streak').notNull().default(0),
  lastDailyAt: timestamp('last_daily_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const economyBalances = pgTable('economy_balances', {
  userId: varchar('user_id', { length: 32 }).primaryKey(),
  walletBalance: bigint('wallet_balance', { mode: 'bigint' }).notNull().default(0n),
  bankBalance: bigint('bank_balance', { mode: 'bigint' }).notNull().default(0n),
  bankCapacity: bigint('bank_capacity', { mode: 'bigint' }).notNull().default(10000n),
  netWorth: bigint('net_worth', { mode: 'bigint' }).notNull().default(0n),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const economyTransactions = pgTable(
  'economy_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: varchar('user_id', { length: 32 }).notNull(),
    guildId: varchar('guild_id', { length: 32 }),
    type: varchar('type', { length: 32 }).notNull(),
    amount: bigint('amount', { mode: 'bigint' }).notNull(),
    currency: varchar('currency', { length: 16 }).notNull().default('CREDITS'),
    balanceBefore: bigint('balance_before', { mode: 'bigint' }).notNull(),
    balanceAfter: bigint('balance_after', { mode: 'bigint' }).notNull(),
    source: varchar('source', { length: 64 }).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_pg_economy_tx_user_created').on(table.userId, table.createdAt),
    index('idx_pg_economy_tx_type').on(table.type),
  ],
);

export const economyRewards = pgTable('economy_rewards', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventType: varchar('event_type', { length: 64 }).notNull(),
  baseAmount: bigint('base_amount', { mode: 'bigint' }).notNull().default(100n),
  multiplier: integer('multiplier').notNull().default(1),
  cooldownSeconds: integer('cooldown_seconds').notNull().default(86400),
});

export const economyCooldowns = pgTable(
  'economy_cooldowns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: varchar('user_id', { length: 32 }).notNull(),
    actionType: varchar('action_type', { length: 64 }).notNull(),
    lastTriggeredAt: timestamp('last_triggered_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('idx_pg_economy_cd_user_action').on(table.userId, table.actionType)],
);

export const economyItemCategories = pgTable('economy_item_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 64 }).notNull(),
  description: text('description'),
});

export const economyItems = pgTable('economy_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 64 }).notNull(),
  description: text('description').notNull(),
  price: bigint('price', { mode: 'bigint' }).notNull(),
  rarity: varchar('rarity', { length: 32 }).notNull().default('COMMON'),
  categoryId: uuid('category_id'),
  iconUrl: text('icon_url'),
  isPurchasable: boolean('is_purchasable').notNull().default(true),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
});

export const economyInventories = pgTable(
  'economy_inventories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: varchar('user_id', { length: 32 }).notNull(),
    itemId: uuid('item_id').notNull(),
    quantity: integer('quantity').notNull().default(1),
    acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_pg_economy_inv_user').on(table.userId, table.itemId)],
);
