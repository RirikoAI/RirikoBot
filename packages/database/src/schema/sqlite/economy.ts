import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const economyAccounts = sqliteTable('economy_accounts', {
  userId: text('user_id').primaryKey(),
  isFrozen: integer('is_frozen', { mode: 'boolean' }).notNull().default(false),
  dailyStreak: integer('daily_streak').notNull().default(0),
  lastDailyAt: integer('last_daily_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const economyBalances = sqliteTable('economy_balances', {
  userId: text('user_id').primaryKey(),
  walletBalance: integer('wallet_balance').notNull().default(0),
  bankBalance: integer('bank_balance').notNull().default(0),
  bankCapacity: integer('bank_capacity').notNull().default(10000),
  netWorth: integer('net_worth').notNull().default(0),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const economyTransactions = sqliteTable(
  'economy_transactions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    guildId: text('guild_id'),
    type: text('type').notNull(), // 'TRANSFER' | 'DEPOSIT' | 'WITHDRAW' | 'DAILY' | 'GAMBLE' | 'SHOP_BUY' | 'MARKET_FEE' | 'TCG_REWARD'
    amount: integer('amount').notNull(),
    currency: text('currency').notNull().default('CREDITS'),
    balanceBefore: integer('balance_before').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    source: text('source').notNull(),
    metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('idx_economy_tx_user_created').on(table.userId, table.createdAt),
    index('idx_economy_tx_type').on(table.type),
  ],
);

export const economyRewards = sqliteTable('economy_rewards', {
  id: text('id').primaryKey(),
  eventType: text('event_type').notNull(),
  baseAmount: integer('base_amount').notNull().default(100),
  multiplier: integer('multiplier').notNull().default(1),
  cooldownSeconds: integer('cooldown_seconds').notNull().default(86400),
});

export const economyCooldowns = sqliteTable(
  'economy_cooldowns',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    actionType: text('action_type').notNull(),
    lastTriggeredAt: integer('last_triggered_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('idx_economy_cd_user_action').on(table.userId, table.actionType)],
);

export const economyItemCategories = sqliteTable('economy_item_categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
});

export const economyItems = sqliteTable('economy_items', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  price: integer('price').notNull(),
  rarity: text('rarity').notNull().default('COMMON'),
  categoryId: text('category_id'),
  iconUrl: text('icon_url'),
  isPurchasable: integer('is_purchasable', { mode: 'boolean' }).notNull().default(true),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().default({}),
});

export const economyInventories = sqliteTable(
  'economy_inventories',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    itemId: text('item_id').notNull(),
    quantity: integer('quantity').notNull().default(1),
    acquiredAt: integer('acquired_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('idx_economy_inv_user').on(table.userId, table.itemId)],
);
