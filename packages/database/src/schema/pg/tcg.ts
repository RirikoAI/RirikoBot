import {
  pgTable,
  text,
  varchar,
  boolean,
  integer,
  bigint,
  real,
  uuid,
  timestamp,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const waifuSources = pgTable('waifu_sources', {
  id: varchar('id', { length: 32 }).primaryKey(),
  name: text('name').notNull(),
  baseUrl: text('base_url').notNull(),
  attributionText: text('attribution_text').notNull(),
  isActive: boolean('is_active').notNull().default(true),
});

export const waifuAssets = pgTable(
  'waifu_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: varchar('source_id', { length: 32 }).notNull(),
    sourceImageId: varchar('source_image_id', { length: 64 }).notNull(),
    characterName: text('character_name').notNull(),
    animeTitle: text('anime_title').notNull(),
    imageHash: varchar('image_hash', { length: 64 }).notNull().unique(),
    localStoragePath: text('local_storage_path'),
    discordCdnUrl: text('discord_cdn_url'),
    isDeletedByRequest: boolean('is_deleted_by_request').notNull().default(false),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_pg_waifu_assets_character').on(table.characterName)],
);

export const waifuCards = pgTable(
  'waifu_cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assetId: uuid('asset_id').notNull(),
    name: text('name').notNull(),
    rarity: varchar('rarity', { length: 32 }).notNull(),
    element: varchar('element', { length: 32 }).notNull(),
    attack: integer('attack').notNull(),
    defense: integer('defense').notNull(),
    speed: integer('speed').notNull(),
    health: integer('health').notNull(),
    critRate: real('crit_rate').notNull().default(0.05),
    skillName: text('skill_name'),
    skillDescription: text('skill_description'),
    passiveName: text('passive_name'),
    passiveDescription: text('passive_description'),
    collectionNumber: integer('collection_number').notNull(),
    isActive: boolean('is_active').notNull().default(true),
  },
  (table) => [
    index('idx_pg_waifu_cards_rarity').on(table.rarity),
    index('idx_pg_waifu_cards_element').on(table.element),
  ],
);

export const userCards = pgTable(
  'user_cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: varchar('user_id', { length: 32 }).notNull(),
    cardId: uuid('card_id').notNull(),
    serialNumber: integer('serial_number').notNull(),
    level: integer('level').notNull().default(1),
    exp: integer('exp').notNull().default(0),
    battlesWon: integer('battles_won').notNull().default(0),
    state: varchar('state', { length: 32 }).notNull().default('IDLE'),
    isFavorite: boolean('is_favorite').notNull().default(false),
    obtainedAt: timestamp('obtained_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_pg_user_cards_user_state').on(table.userId, table.state),
    index('idx_pg_user_cards_card').on(table.cardId),
  ],
);

export const gameItems = pgTable('game_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 64 }).notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  type: varchar('type', { length: 32 }).notNull(),
  subtype: varchar('subtype', { length: 32 }).notNull(),
  rarity: varchar('rarity', { length: 32 }).notNull().default('COMMON'),
  baseStats: jsonb('base_stats').$type<Record<string, number>>().default({}),
  battlePerks: jsonb('battle_perks').$type<string[]>().default([]),
  consumableEffect: jsonb('consumable_effect').$type<Record<string, unknown>>().default({}),
  isShopBuyable: boolean('is_shop_buyable').notNull().default(true),
  shopPrice: bigint('shop_price', { mode: 'bigint' }).notNull().default(100n),
  maxDailyPurchases: integer('max_daily_purchases').notNull().default(5),
  isTradeable: boolean('is_tradeable').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userInventoryItems = pgTable(
  'user_inventory_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: varchar('user_id', { length: 32 }).notNull(),
    itemId: uuid('item_id').notNull(),
    quantity: integer('quantity').notNull().default(1),
    enhancementLevel: integer('enhancement_level').notNull().default(0),
    equippedToCardId: uuid('equipped_to_card_id'),
    slot: varchar('slot', { length: 32 }).notNull().default('NONE'),
    state: varchar('state', { length: 32 }).notNull().default('IDLE'),
    obtainedFrom: varchar('obtained_from', { length: 32 }).notNull().default('SHOP'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_pg_user_inv_items_user_state').on(table.userId, table.state)],
);

export const playerEnergy = pgTable('player_energy', {
  userId: varchar('user_id', { length: 32 }).primaryKey(),
  currentEnergy: integer('current_energy').notNull().default(100),
  maxEnergy: integer('max_energy').notNull().default(100),
  bonusEnergy: integer('bonus_energy').notNull().default(0),
  dailyEnergyPotsUsed: integer('daily_energy_pots_used').notNull().default(0),
  lastReplenishedAt: timestamp('last_replenished_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastResetDate: varchar('last_reset_date', { length: 16 }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const gameAchievements = pgTable('game_achievements', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 64 }).notNull().unique(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  category: varchar('category', { length: 32 }).notNull(),
  tier: varchar('tier', { length: 32 }).notNull().default('BRONZE'),
  requirementType: varchar('requirement_type', { length: 64 }).notNull(),
  requirementTarget: integer('requirement_target').notNull().default(1),
  rewardXp: integer('reward_xp').notNull().default(0),
  rewardCredits: bigint('reward_credits', { mode: 'bigint' }).notNull().default(0n),
  rewardCardId: uuid('reward_card_id'),
  rewardItemId: uuid('reward_item_id'),
  rewardConsumables: jsonb('reward_consumables').$type<Record<string, unknown>>().default({}),
  rewardTitle: text('reward_title'),
  badgeIcon: text('badge_icon'),
  isHidden: boolean('is_hidden').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userAchievements = pgTable(
  'user_achievements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: varchar('user_id', { length: 32 }).notNull(),
    achievementId: uuid('achievement_id').notNull(),
    progress: integer('progress').notNull().default(0),
    isUnlocked: boolean('is_unlocked').notNull().default(false),
    isClaimed: boolean('is_claimed').notNull().default(false),
    unlockedAt: timestamp('unlocked_at', { withTimezone: true }),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
  },
  (table) => [index('idx_pg_user_achievements_user_claimed').on(table.userId, table.isClaimed)],
);

export const dungeonSeasons = pgTable('dungeon_seasons', {
  id: varchar('id', { length: 32 }).primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  themeElement: varchar('theme_element', { length: 32 }).notNull().default('ALL'),
  seasonalAffixes: jsonb('seasonal_affixes').$type<string[]>().default([]),
  scalingModel: varchar('scaling_model', { length: 32 }).notNull().default('HYBRID'),
  scalingParams: jsonb('scaling_params').$type<Record<string, unknown>>().default({}),
  isTutorial: boolean('is_tutorial').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dungeonFloors = pgTable(
  'dungeon_floors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    seasonId: varchar('season_id', { length: 32 }).notNull(),
    floorNumber: integer('floor_number').notNull(),
    name: text('name').notNull(),
    energyCost: integer('energy_cost').notNull().default(10),
    minPlayerLevel: integer('min_player_level').notNull().default(1),
    enemyLineup: jsonb('enemy_lineup').$type<Record<string, unknown>[]>().notNull(),
    floorAffixes: jsonb('floor_affixes').$type<string[]>().default([]),
    isBossFloor: boolean('is_boss_floor').notNull().default(false),
    firstClearRewards: jsonb('first_clear_rewards').$type<Record<string, unknown>>().default({}),
    repeatRewardsTable: jsonb('repeat_rewards_table').$type<Record<string, unknown>>().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_pg_dungeon_floors_season_floor').on(table.seasonId, table.floorNumber)],
);

export const userDungeonProgress = pgTable(
  'user_dungeon_progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: varchar('user_id', { length: 32 }).notNull(),
    seasonId: varchar('season_id', { length: 32 }).notNull(),
    highestClearedFloor: integer('highest_cleared_floor').notNull().default(0),
    attemptsCount: integer('attempts_count').notNull().default(0),
    clearCount: integer('clear_count').notNull().default(0),
    firstClearedAt: timestamp('first_cleared_at', { withTimezone: true }),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('idx_pg_user_dungeon_unique').on(table.userId, table.seasonId)],
);

export const tcgSystemConfigs = pgTable('tcg_system_configs', {
  key: varchar('key', { length: 64 }).primaryKey(),
  value: jsonb('value').$type<Record<string, unknown>>().notNull(),
  updatedBy: varchar('updated_by', { length: 32 }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cardTrades = pgTable(
  'card_trades',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    senderUserId: varchar('sender_user_id', { length: 32 }).notNull(),
    receiverUserId: varchar('receiver_user_id', { length: 32 }).notNull(),
    offeredCardIds: jsonb('offered_card_ids').$type<string[]>().notNull().default([]),
    requestedCardIds: jsonb('requested_card_ids').$type<string[]>().notNull().default([]),
    offeredCredits: bigint('offered_credits', { mode: 'bigint' }).notNull().default(0n),
    requestedCredits: bigint('requested_credits', { mode: 'bigint' }).notNull().default(0n),
    status: varchar('status', { length: 32 }).notNull().default('PENDING'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [index('idx_pg_card_trades_users').on(table.senderUserId, table.receiverUserId)],
);

export const marketListings = pgTable(
  'market_listings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sellerUserId: varchar('seller_user_id', { length: 32 }).notNull(),
    userCardId: uuid('user_card_id').notNull(),
    price: bigint('price', { mode: 'bigint' }).notNull(),
    taxPaid: bigint('tax_paid', { mode: 'bigint' }).notNull().default(0n),
    status: varchar('status', { length: 32 }).notNull().default('ACTIVE'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('idx_pg_market_listings_status').on(table.status),
    index('idx_pg_market_listings_seller').on(table.sellerUserId),
  ],
);

export const waifuGuilds = pgTable('waifu_guilds', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 64 }).notNull().unique(),
  leaderUserId: varchar('leader_user_id', { length: 32 }).notNull(),
  level: integer('level').notNull().default(1),
  guildXp: bigint('guild_xp', { mode: 'bigint' }).notNull().default(0n),
  guildBank: bigint('guild_bank', { mode: 'bigint' }).notNull().default(0n),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const waifuGuildMembers = pgTable(
  'waifu_guild_members',
  {
    guildId: uuid('guild_id').notNull(),
    userId: varchar('user_id', { length: 32 }).notNull(),
    rank: varchar('rank', { length: 32 }).notNull().default('MEMBER'),
    contributionXp: bigint('contribution_xp', { mode: 'bigint' }).notNull().default(0n),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.userId] })],
);

export const quests = pgTable('quests', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  rewardXp: integer('reward_xp').notNull().default(0),
  rewardCredits: bigint('reward_credits', { mode: 'bigint' }).notNull().default(0n),
  rewardCardId: uuid('reward_card_id'),
  targetCount: integer('target_count').notNull().default(1),
  type: varchar('type', { length: 32 }).notNull(),
});

export const bosses = pgTable('bosses', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  totalHp: bigint('total_hp', { mode: 'bigint' }).notNull(),
  currentHp: bigint('current_hp', { mode: 'bigint' }).notNull(),
  element: varchar('element', { length: 32 }).notNull(),
  rewardsTable: jsonb('rewards_table').$type<Record<string, unknown>>().default({}),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
});

export const bossRuns = pgTable(
  'boss_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bossId: uuid('boss_id').notNull(),
    userId: varchar('user_id', { length: 32 }).notNull(),
    damageDealt: bigint('damage_dealt', { mode: 'bigint' }).notNull(),
    cardsUsed: jsonb('cards_used').$type<string[]>().notNull().default([]),
    performedAt: timestamp('performed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_pg_boss_runs_boss').on(table.bossId, table.performedAt)],
);
