import {
  sqliteTable,
  text,
  integer,
  real,
  primaryKey,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const waifuSources = sqliteTable('waifu_sources', {
  id: text('id').primaryKey(), // 'WAIFU_IM' | 'NEKOS_BEST' | 'OTAKUGIFS'
  name: text('name').notNull(),
  baseUrl: text('base_url').notNull(),
  attributionText: text('attribution_text').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
});

export const waifuAssets = sqliteTable(
  'waifu_assets',
  {
    id: text('id').primaryKey(),
    sourceId: text('source_id').notNull(),
    sourceImageId: text('source_image_id').notNull(),
    characterName: text('character_name').notNull(),
    animeTitle: text('anime_title').notNull(),
    imageHash: text('image_hash').notNull().unique(),
    localStoragePath: text('local_storage_path'),
    discordCdnUrl: text('discord_cdn_url'),
    isDeletedByRequest: integer('is_deleted_by_request', { mode: 'boolean' })
      .notNull()
      .default(false),
    tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('idx_waifu_assets_character').on(table.characterName)],
);

export const waifuCards = sqliteTable(
  'waifu_cards',
  {
    id: text('id').primaryKey(),
    assetId: text('asset_id').notNull(),
    name: text('name').notNull(),
    rarity: text('rarity').notNull(), // 'COMMON' | 'UNCOMMON' | 'RARE' | 'SUPER_RARE' | 'ULTRA_RARE' | 'SECRET_RARE' | 'SIR' | 'MYTHIC'
    element: text('element').notNull(), // 'FIRE' | 'WATER' | 'EARTH' | 'LIGHTNING' | 'ICE' | 'LIGHT' | 'SHADOW'
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
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  },
  (table) => [
    index('idx_waifu_cards_rarity').on(table.rarity),
    index('idx_waifu_cards_element').on(table.element),
  ],
);

export const userCards = sqliteTable(
  'user_cards',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    cardId: text('card_id').notNull(),
    serialNumber: integer('serial_number').notNull(),
    level: integer('level').notNull().default(1),
    exp: integer('exp').notNull().default(0),
    battlesWon: integer('battles_won').notNull().default(0),
    state: text('state').notNull().default('IDLE'), // 'IDLE' | 'EQUIPPED' | 'IN_TRADE' | 'IN_MARKET'
    isFavorite: integer('is_favorite', { mode: 'boolean' }).notNull().default(false),
    obtainedAt: integer('obtained_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('idx_user_cards_user_state').on(table.userId, table.state),
    index('idx_user_cards_card').on(table.cardId),
  ],
);

export const gameItems = sqliteTable('game_items', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  type: text('type').notNull(), // 'EQUIPMENT' | 'ACCESSORY' | 'CONSUMABLE'
  subtype: text('subtype').notNull(),
  rarity: text('rarity').notNull().default('COMMON'),
  baseStats: text('base_stats', { mode: 'json' }).$type<Record<string, number>>().default({}),
  battlePerks: text('battle_perks', { mode: 'json' }).$type<string[]>().default([]),
  consumableEffect: text('consumable_effect', { mode: 'json' })
    .$type<Record<string, unknown>>()
    .default({}),
  isShopBuyable: integer('is_shop_buyable', { mode: 'boolean' }).notNull().default(true),
  shopPrice: integer('shop_price').notNull().default(100),
  maxDailyPurchases: integer('max_daily_purchases').notNull().default(5),
  isTradeable: integer('is_tradeable', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const userInventoryItems = sqliteTable(
  'user_inventory_items',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    itemId: text('item_id').notNull(),
    quantity: integer('quantity').notNull().default(1),
    enhancementLevel: integer('enhancement_level').notNull().default(0),
    equippedToCardId: text('equipped_to_card_id'),
    slot: text('slot').notNull().default('NONE'),
    state: text('state').notNull().default('IDLE'),
    obtainedFrom: text('obtained_from').notNull().default('SHOP'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('idx_user_inv_items_user_state').on(table.userId, table.state)],
);

export const playerEnergy = sqliteTable('player_energy', {
  userId: text('user_id').primaryKey(),
  currentEnergy: integer('current_energy').notNull().default(100),
  maxEnergy: integer('max_energy').notNull().default(100),
  bonusEnergy: integer('bonus_energy').notNull().default(0),
  dailyEnergyPotsUsed: integer('daily_energy_pots_used').notNull().default(0),
  lastReplenishedAt: integer('last_replenished_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  lastResetDate: text('last_reset_date').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const gameAchievements = sqliteTable('game_achievements', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  category: text('category').notNull(),
  tier: text('tier').notNull().default('BRONZE'),
  requirementType: text('requirement_type').notNull(),
  requirementTarget: integer('requirement_target').notNull().default(1),
  rewardXp: integer('reward_xp').notNull().default(0),
  rewardCredits: integer('reward_credits').notNull().default(0),
  rewardCardId: text('reward_card_id'),
  rewardItemId: text('reward_item_id'),
  rewardConsumables: text('reward_consumables', { mode: 'json' })
    .$type<Record<string, unknown>>()
    .default({}),
  rewardTitle: text('reward_title'),
  badgeIcon: text('badge_icon'),
  isHidden: integer('is_hidden', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const userAchievements = sqliteTable(
  'user_achievements',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    achievementId: text('achievement_id').notNull(),
    progress: integer('progress').notNull().default(0),
    isUnlocked: integer('is_unlocked', { mode: 'boolean' }).notNull().default(false),
    isClaimed: integer('is_claimed', { mode: 'boolean' }).notNull().default(false),
    unlockedAt: integer('unlocked_at', { mode: 'timestamp_ms' }),
    claimedAt: integer('claimed_at', { mode: 'timestamp_ms' }),
  },
  (table) => [index('idx_user_achievements_user_claimed').on(table.userId, table.isClaimed)],
);

export const dungeonSeasons = sqliteTable('dungeon_seasons', {
  id: text('id').primaryKey(), // 'TUTORIAL', 'S1', 'S2', etc.
  name: text('name').notNull(),
  description: text('description').notNull(),
  themeElement: text('theme_element').notNull().default('ALL'),
  seasonalAffixes: text('seasonal_affixes', { mode: 'json' }).$type<string[]>().default([]),
  scalingModel: text('scaling_model').notNull().default('HYBRID'),
  scalingParams: text('scaling_params', { mode: 'json' })
    .$type<Record<string, unknown>>()
    .default({}),
  isTutorial: integer('is_tutorial', { mode: 'boolean' }).notNull().default(false),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  startsAt: integer('starts_at', { mode: 'timestamp_ms' }).notNull(),
  endsAt: integer('ends_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const dungeonFloors = sqliteTable(
  'dungeon_floors',
  {
    id: text('id').primaryKey(),
    seasonId: text('season_id').notNull(),
    floorNumber: integer('floor_number').notNull(),
    name: text('name').notNull(),
    energyCost: integer('energy_cost').notNull().default(10),
    minPlayerLevel: integer('min_player_level').notNull().default(1),
    enemyLineup: text('enemy_lineup', { mode: 'json' })
      .$type<Record<string, unknown>[]>()
      .notNull(),
    floorAffixes: text('floor_affixes', { mode: 'json' }).$type<string[]>().default([]),
    isBossFloor: integer('is_boss_floor', { mode: 'boolean' }).notNull().default(false),
    firstClearRewards: text('first_clear_rewards', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .default({}),
    repeatRewardsTable: text('repeat_rewards_table', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .default({}),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('idx_dungeon_floors_season_floor').on(table.seasonId, table.floorNumber)],
);

/**
 * Seasonal dungeon bosses: real anime characters synced by `pnpm tcg:boss-builder`.
 * `definition` holds combat overrides (stats or stat multipliers, skill, enrage, wards).
 */
export const dungeonBosses = sqliteTable(
  'dungeon_bosses',
  {
    id: text('id').primaryKey(), // '<seasonId>:<key>'
    seasonId: text('season_id').notNull(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    animeTitle: text('anime_title').notNull(),
    element: text('element').notNull(),
    tier: text('tier').notNull().default('STANDARD'), // 'STANDARD' | 'MINI_BOSS' | 'MAJOR_BOSS'
    title: text('title'),
    flavorText: text('flavor_text'),
    assetId: text('asset_id'),
    anilistId: integer('anilist_id'),
    danbooruTag: text('danbooru_tag'),
    imagePath: text('image_path'),
    definition: text('definition', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    signatureDropCode: text('signature_drop_code'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex('idx_dungeon_bosses_season_key').on(table.seasonId, table.key)],
);

export const userDungeonProgress = sqliteTable(
  'user_dungeon_progress',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    seasonId: text('season_id').notNull(),
    highestClearedFloor: integer('highest_cleared_floor').notNull().default(0),
    attemptsCount: integer('attempts_count').notNull().default(0),
    clearCount: integer('clear_count').notNull().default(0),
    firstClearedAt: integer('first_cleared_at', { mode: 'timestamp_ms' }),
    lastAttemptAt: integer('last_attempt_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex('idx_user_dungeon_unique').on(table.userId, table.seasonId)],
);

export const tcgSystemConfigs = sqliteTable('tcg_system_configs', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  updatedBy: text('updated_by').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const cardTrades = sqliteTable(
  'card_trades',
  {
    id: text('id').primaryKey(),
    senderUserId: text('sender_user_id').notNull(),
    receiverUserId: text('receiver_user_id').notNull(),
    offeredCardIds: text('offered_card_ids', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default([]),
    requestedCardIds: text('requested_card_ids', { mode: 'json' })
      .$type<string[]>()
      .notNull()
      .default([]),
    offeredCredits: integer('offered_credits').notNull().default(0),
    requestedCredits: integer('requested_credits').notNull().default(0),
    status: text('status').notNull().default('PENDING'), // 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED'
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
  },
  (table) => [index('idx_card_trades_users').on(table.senderUserId, table.receiverUserId)],
);

export const marketListings = sqliteTable(
  'market_listings',
  {
    id: text('id').primaryKey(),
    sellerUserId: text('seller_user_id').notNull(),
    userCardId: text('user_card_id').notNull(),
    price: integer('price').notNull(),
    taxPaid: integer('tax_paid').notNull().default(0),
    status: text('status').notNull().default('ACTIVE'), // 'ACTIVE' | 'SOLD' | 'CANCELLED' | 'EXPIRED'
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [
    index('idx_market_listings_status').on(table.status),
    index('idx_market_listings_seller').on(table.sellerUserId),
  ],
);

export const waifuGuilds = sqliteTable('waifu_guilds', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  leaderUserId: text('leader_user_id').notNull(),
  level: integer('level').notNull().default(1),
  guildXp: integer('guild_xp').notNull().default(0),
  guildBank: integer('guild_bank').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const waifuGuildMembers = sqliteTable(
  'waifu_guild_members',
  {
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    rank: text('rank').notNull().default('MEMBER'), // 'LEADER' | 'OFFICER' | 'MEMBER'
    contributionXp: integer('contribution_xp').notNull().default(0),
    joinedAt: integer('joined_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [primaryKey({ columns: [table.guildId, table.userId] })],
);

export const quests = sqliteTable('quests', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  rewardXp: integer('reward_xp').notNull().default(0),
  rewardCredits: integer('reward_credits').notNull().default(0),
  rewardCardId: text('reward_card_id'),
  targetCount: integer('target_count').notNull().default(1),
  type: text('type').notNull(), // 'DAILY' | 'WEEKLY'
});

export const bosses = sqliteTable('bosses', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  totalHp: integer('total_hp').notNull(),
  currentHp: integer('current_hp').notNull(),
  element: text('element').notNull(),
  rewardsTable: text('rewards_table', { mode: 'json' })
    .$type<Record<string, unknown>>()
    .default({}),
  startsAt: integer('starts_at', { mode: 'timestamp_ms' }).notNull(),
  endsAt: integer('ends_at', { mode: 'timestamp_ms' }).notNull(),
});

export const bossRuns = sqliteTable(
  'boss_runs',
  {
    id: text('id').primaryKey(),
    bossId: text('boss_id').notNull(),
    userId: text('user_id').notNull(),
    damageDealt: integer('damage_dealt').notNull(),
    cardsUsed: text('cards_used', { mode: 'json' }).$type<string[]>().notNull().default([]),
    performedAt: integer('performed_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index('idx_boss_runs_boss').on(table.bossId, table.performedAt)],
);
