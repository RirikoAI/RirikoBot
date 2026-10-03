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
  uniqueIndex,
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
  walletBalance: bigint('wallet_balance', { mode: 'number' }).notNull().default(0),
  bankBalance: bigint('bank_balance', { mode: 'number' }).notNull().default(0),
  bankCapacity: bigint('bank_capacity', { mode: 'number' }).notNull().default(10000),
  netWorth: bigint('net_worth', { mode: 'number' }).notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const economyTransactions = pgTable(
  'economy_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: varchar('user_id', { length: 32 }).notNull(),
    guildId: varchar('guild_id', { length: 32 }),
    type: varchar('type', { length: 32 }).notNull(),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    currency: varchar('currency', { length: 16 }).notNull().default('CREDITS'),
    balanceBefore: bigint('balance_before', { mode: 'number' }).notNull(),
    balanceAfter: bigint('balance_after', { mode: 'number' }).notNull(),
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
  baseAmount: bigint('base_amount', { mode: 'number' }).notNull().default(100),
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

export const economyItemCategories = pgTable(
  'economy_item_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Stable slug (`consumable`); the default catalog seeds by it. */
    code: varchar('code', { length: 32 }),
    name: varchar('name', { length: 64 }).notNull(),
    description: text('description'),
  },
  (table) => [uniqueIndex('uq_pg_economy_item_categories_code').on(table.code)],
);

export const economyItems = pgTable(
  'economy_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Stable slug members type in `/shop buy`; the default catalog seeds by it. */
    code: varchar('code', { length: 32 }),
    name: varchar('name', { length: 64 }).notNull(),
    description: text('description').notNull(),
    price: bigint('price', { mode: 'number' }).notNull(),
    rarity: varchar('rarity', { length: 32 }).notNull().default('COMMON'),
    categoryId: uuid('category_id'),
    iconUrl: text('icon_url'),
    isPurchasable: boolean('is_purchasable').notNull().default(true),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  },
  (table) => [uniqueIndex('uq_pg_economy_items_code').on(table.code)],
);

export const economyInventories = pgTable(
  'economy_inventories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: varchar('user_id', { length: 32 }).notNull(),
    itemId: uuid('item_id').notNull(),
    quantity: integer('quantity').notNull().default(1),
    acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_pg_economy_inv_user').on(table.userId, table.itemId),
    index('idx_pg_economy_inv_item').on(table.itemId),
  ],
);

/** Global economy values edited in the owner console; one row with id `global`. */
export const economyConfig = pgTable('economy_config', {
  id: varchar('id', { length: 16 }).primaryKey(),
  dailyBaseReward: integer('daily_base_reward').notNull().default(250),
  dailyStreakBonusPercent: integer('daily_streak_bonus_percent').notNull().default(5),
  dailyMaxStreakBonusPercent: integer('daily_max_streak_bonus_percent').notNull().default(150),
  bankBaseCapacity: integer('bank_base_capacity').notNull().default(10000),
  bankCapacityPerLevel: integer('bank_capacity_per_level').notNull().default(2500),
  updatedBy: varchar('updated_by', { length: 64 }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
