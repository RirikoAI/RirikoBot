import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabaseClient } from '../client/factory.js';
import type { SqliteDatabaseClient } from '../client/types.js';
import * as sqliteSchema from './sqlite/index.js';
import * as pgSchema from './pg/index.js';
import { eq } from 'drizzle-orm';

describe('Dual-Dialect Complete Schema Catalog (70+ Tables)', () => {
  describe('Schema Dialect Export Parity across all 14 domains', () => {
    it('exports parallel tables across SQLite and PostgreSQL for all domains', () => {
      // 1. Identity & Guilds
      expect(sqliteSchema.users).toBeDefined();
      expect(pgSchema.users).toBeDefined();
      expect(sqliteSchema.guilds).toBeDefined();
      expect(pgSchema.guilds).toBeDefined();
      expect(sqliteSchema.guildMembers).toBeDefined();
      expect(pgSchema.guildMembers).toBeDefined();
      expect(sqliteSchema.guildSettings).toBeDefined();
      expect(pgSchema.guildSettings).toBeDefined();

      // 2. Commands
      expect(sqliteSchema.commands).toBeDefined();
      expect(pgSchema.commands).toBeDefined();
      expect(sqliteSchema.commandSettings).toBeDefined();
      expect(pgSchema.commandSettings).toBeDefined();

      // 3. Moderation
      expect(sqliteSchema.moderationCases).toBeDefined();
      expect(pgSchema.moderationCases).toBeDefined();
      expect(sqliteSchema.moderationWarnings).toBeDefined();
      expect(pgSchema.moderationWarnings).toBeDefined();
      expect(sqliteSchema.moderationRules).toBeDefined();
      expect(pgSchema.moderationRules).toBeDefined();
      expect(sqliteSchema.moderationNotes).toBeDefined();
      expect(pgSchema.moderationNotes).toBeDefined();

      // 4. Economy & Banking
      expect(sqliteSchema.economyAccounts).toBeDefined();
      expect(pgSchema.economyAccounts).toBeDefined();
      expect(sqliteSchema.economyBalances).toBeDefined();
      expect(pgSchema.economyBalances).toBeDefined();
      expect(sqliteSchema.economyTransactions).toBeDefined();
      expect(pgSchema.economyTransactions).toBeDefined();
      expect(sqliteSchema.economyRewards).toBeDefined();
      expect(pgSchema.economyRewards).toBeDefined();
      expect(sqliteSchema.economyCooldowns).toBeDefined();
      expect(pgSchema.economyCooldowns).toBeDefined();
      expect(sqliteSchema.economyItems).toBeDefined();
      expect(pgSchema.economyItems).toBeDefined();
      expect(sqliteSchema.economyItemCategories).toBeDefined();
      expect(pgSchema.economyItemCategories).toBeDefined();
      expect(sqliteSchema.economyInventories).toBeDefined();
      expect(pgSchema.economyInventories).toBeDefined();

      // 5. XP & Leveling
      expect(sqliteSchema.xpAccounts).toBeDefined();
      expect(pgSchema.xpAccounts).toBeDefined();
      expect(sqliteSchema.xpEvents).toBeDefined();
      expect(pgSchema.xpEvents).toBeDefined();
      expect(sqliteSchema.leaderboardSnapshots).toBeDefined();
      expect(pgSchema.leaderboardSnapshots).toBeDefined();

      // 6. Music & Audio
      expect(sqliteSchema.musicGuildSettings).toBeDefined();
      expect(pgSchema.musicGuildSettings).toBeDefined();
      expect(sqliteSchema.musicChannels).toBeDefined();
      expect(pgSchema.musicChannels).toBeDefined();
      expect(sqliteSchema.musicHistory).toBeDefined();
      expect(pgSchema.musicHistory).toBeDefined();
      expect(sqliteSchema.musicSavedPlaylists).toBeDefined();
      expect(pgSchema.musicSavedPlaylists).toBeDefined();
      expect(sqliteSchema.musicPlaylistTracks).toBeDefined();
      expect(pgSchema.musicPlaylistTracks).toBeDefined();

      // 7. AI Chatbot
      expect(sqliteSchema.aiChannels).toBeDefined();
      expect(pgSchema.aiChannels).toBeDefined();
      expect(sqliteSchema.aiConversations).toBeDefined();
      expect(pgSchema.aiConversations).toBeDefined();
      expect(sqliteSchema.aiMessages).toBeDefined();
      expect(pgSchema.aiMessages).toBeDefined();
      expect(sqliteSchema.aiGuildPreferences).toBeDefined();
      expect(pgSchema.aiGuildPreferences).toBeDefined();
      expect(sqliteSchema.aiUserPreferences).toBeDefined();
      expect(pgSchema.aiUserPreferences).toBeDefined();

      // 8. Image Generation & Graphics
      expect(sqliteSchema.imageProviders).toBeDefined();
      expect(pgSchema.imageProviders).toBeDefined();
      expect(sqliteSchema.imageJobs).toBeDefined();
      expect(pgSchema.imageJobs).toBeDefined();
      expect(sqliteSchema.imagePresets).toBeDefined();
      expect(pgSchema.imagePresets).toBeDefined();
      expect(sqliteSchema.imageUsage).toBeDefined();
      expect(pgSchema.imageUsage).toBeDefined();

      // 9. Giveaways
      expect(sqliteSchema.giveaways).toBeDefined();
      expect(pgSchema.giveaways).toBeDefined();
      expect(sqliteSchema.giveawayEntries).toBeDefined();
      expect(pgSchema.giveawayEntries).toBeDefined();
      expect(sqliteSchema.giveawayWinners).toBeDefined();
      expect(pgSchema.giveawayWinners).toBeDefined();

      // 10. Stream Platforms
      expect(sqliteSchema.streamers).toBeDefined();
      expect(pgSchema.streamers).toBeDefined();
      expect(sqliteSchema.streamSubscriptions).toBeDefined();
      expect(pgSchema.streamSubscriptions).toBeDefined();
      expect(sqliteSchema.streamEvents).toBeDefined();
      expect(pgSchema.streamEvents).toBeDefined();
      expect(sqliteSchema.streamAnnouncements).toBeDefined();
      expect(pgSchema.streamAnnouncements).toBeDefined();
      expect(sqliteSchema.streamAssets).toBeDefined();
      expect(pgSchema.streamAssets).toBeDefined();

      // 11. Free Games
      expect(sqliteSchema.freeGames).toBeDefined();
      expect(pgSchema.freeGames).toBeDefined();
      expect(sqliteSchema.freeGameAnnouncements).toBeDefined();
      expect(pgSchema.freeGameAnnouncements).toBeDefined();
      expect(sqliteSchema.freeGameChannels).toBeDefined();
      expect(pgSchema.freeGameChannels).toBeDefined();

      // 12. Waifu TCG & Gamification (20 tables)
      expect(sqliteSchema.waifuSources).toBeDefined();
      expect(pgSchema.waifuSources).toBeDefined();
      expect(sqliteSchema.waifuAssets).toBeDefined();
      expect(pgSchema.waifuAssets).toBeDefined();
      expect(sqliteSchema.waifuCards).toBeDefined();
      expect(pgSchema.waifuCards).toBeDefined();
      expect(sqliteSchema.userCards).toBeDefined();
      expect(pgSchema.userCards).toBeDefined();
      expect(sqliteSchema.gameItems).toBeDefined();
      expect(pgSchema.gameItems).toBeDefined();
      expect(sqliteSchema.userInventoryItems).toBeDefined();
      expect(pgSchema.userInventoryItems).toBeDefined();
      expect(sqliteSchema.playerEnergy).toBeDefined();
      expect(pgSchema.playerEnergy).toBeDefined();
      expect(sqliteSchema.gameAchievements).toBeDefined();
      expect(pgSchema.gameAchievements).toBeDefined();
      expect(sqliteSchema.userAchievements).toBeDefined();
      expect(pgSchema.userAchievements).toBeDefined();
      expect(sqliteSchema.dungeonSeasons).toBeDefined();
      expect(pgSchema.dungeonSeasons).toBeDefined();
      expect(sqliteSchema.dungeonFloors).toBeDefined();
      expect(pgSchema.dungeonFloors).toBeDefined();
      expect(sqliteSchema.userDungeonProgress).toBeDefined();
      expect(pgSchema.userDungeonProgress).toBeDefined();
      expect(sqliteSchema.tcgSystemConfigs).toBeDefined();
      expect(pgSchema.tcgSystemConfigs).toBeDefined();
      expect(sqliteSchema.cardTrades).toBeDefined();
      expect(pgSchema.cardTrades).toBeDefined();
      expect(sqliteSchema.marketListings).toBeDefined();
      expect(pgSchema.marketListings).toBeDefined();
      expect(sqliteSchema.waifuGuilds).toBeDefined();
      expect(pgSchema.waifuGuilds).toBeDefined();
      expect(sqliteSchema.waifuGuildMembers).toBeDefined();
      expect(pgSchema.waifuGuildMembers).toBeDefined();
      expect(sqliteSchema.quests).toBeDefined();
      expect(pgSchema.quests).toBeDefined();
      expect(sqliteSchema.bosses).toBeDefined();
      expect(pgSchema.bosses).toBeDefined();
      expect(sqliteSchema.bossRuns).toBeDefined();
      expect(pgSchema.bossRuns).toBeDefined();

      // 13. Mini-Games
      expect(sqliteSchema.miniGames).toBeDefined();
      expect(pgSchema.miniGames).toBeDefined();
      expect(sqliteSchema.gameSessions).toBeDefined();
      expect(pgSchema.gameSessions).toBeDefined();
      expect(sqliteSchema.gameStatistics).toBeDefined();
      expect(pgSchema.gameStatistics).toBeDefined();

      // 14. Utilities & Reminders
      expect(sqliteSchema.reactionRoles).toBeDefined();
      expect(pgSchema.reactionRoles).toBeDefined();
      expect(sqliteSchema.autoVoiceConfigs).toBeDefined();
      expect(pgSchema.autoVoiceConfigs).toBeDefined();
      expect(sqliteSchema.reminders).toBeDefined();
      expect(pgSchema.reminders).toBeDefined();
      expect(sqliteSchema.guildWelcomer).toBeDefined();
      expect(pgSchema.guildWelcomer).toBeDefined();
      expect(sqliteSchema.guildFarewell).toBeDefined();
      expect(pgSchema.guildFarewell).toBeDefined();
      expect(sqliteSchema.auditLogs).toBeDefined();
      expect(pgSchema.auditLogs).toBeDefined();
    });
  });

  describe('SQLite In-Memory Schema Operations', () => {
    let client: SqliteDatabaseClient;

    beforeEach(async () => {
      const baseClient = await createDatabaseClient({
        dialect: 'sqlite',
        url: ':memory:',
      });
      client = baseClient as SqliteDatabaseClient;

      // Create core tables for test
      client.raw.exec(`
        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          display_name TEXT,
          avatar_url TEXT,
          profile_background_url TEXT,
          is_blacklisted INTEGER NOT NULL DEFAULT 0,
          warn_count INTEGER NOT NULL DEFAULT 0,
          notify_level_up INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE guilds (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          icon_url TEXT,
          owner_id TEXT NOT NULL,
          joined_at INTEGER NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE guild_settings (
          guild_id TEXT PRIMARY KEY,
          prefix TEXT NOT NULL DEFAULT '!',
          locale TEXT NOT NULL DEFAULT 'en-US',
          timezone TEXT NOT NULL DEFAULT 'UTC',
          ai_channel_id TEXT,
          log_channel_id TEXT,
          escalation_steps TEXT,
          music_channel_id TEXT,
          welcomer_channel_id TEXT,
          welcomer_enabled INTEGER NOT NULL DEFAULT 0,
          welcomer_bg TEXT,
          farewell_channel_id TEXT,
          farewell_enabled INTEGER NOT NULL DEFAULT 0,
          farewell_bg TEXT,
          karma_notifications_enabled INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE economy_balances (
          user_id TEXT PRIMARY KEY,
          wallet_balance INTEGER NOT NULL DEFAULT 0,
          bank_balance INTEGER NOT NULL DEFAULT 0,
          bank_capacity INTEGER NOT NULL DEFAULT 10000,
          net_worth INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE moderation_cases (
          id TEXT PRIMARY KEY,
          guild_id TEXT NOT NULL,
          case_number INTEGER NOT NULL,
          type TEXT NOT NULL,
          target_user_id TEXT NOT NULL,
          moderator_user_id TEXT NOT NULL,
          reason TEXT NOT NULL DEFAULT 'No reason provided',
          duration_seconds INTEGER,
          metadata TEXT DEFAULT '{}',
          created_at INTEGER NOT NULL
        );

        CREATE TABLE waifu_cards (
          id TEXT PRIMARY KEY,
          asset_id TEXT NOT NULL,
          name TEXT NOT NULL,
          rarity TEXT NOT NULL,
          element TEXT NOT NULL,
          attack INTEGER NOT NULL,
          defense INTEGER NOT NULL,
          speed INTEGER NOT NULL,
          health INTEGER NOT NULL,
          crit_rate REAL NOT NULL DEFAULT 0.05,
          skill_name TEXT,
          skill_description TEXT,
          passive_name TEXT,
          passive_description TEXT,
          collection_number INTEGER NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE player_energy (
          user_id TEXT PRIMARY KEY,
          current_energy INTEGER NOT NULL DEFAULT 100,
          max_energy INTEGER NOT NULL DEFAULT 100,
          bonus_energy INTEGER NOT NULL DEFAULT 0,
          daily_energy_pots_used INTEGER NOT NULL DEFAULT 0,
          last_replenished_at INTEGER NOT NULL,
          last_reset_date TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
    });

    afterEach(async () => {
      await client.close();
    });

    it('inserts and selects records via Drizzle schema on users and guild_settings', async () => {
      const now = new Date();

      // Insert User
      await client.db.insert(sqliteSchema.users).values({
        id: '123456789012345678',
        username: 'ririko_user',
        displayName: 'Ririko Fan',
        createdAt: now,
        updatedAt: now,
      });

      const userRows = await client.db
        .select()
        .from(sqliteSchema.users)
        .where(eq(sqliteSchema.users.id, '123456789012345678'));

      expect(userRows).toHaveLength(1);
      expect(userRows[0]?.username).toBe('ririko_user');
      expect(userRows[0]?.isBlacklisted).toBe(false);

      // Insert GuildSettings
      await client.db.insert(sqliteSchema.guildSettings).values({
        guildId: '987654321098765432',
        prefix: '?',
        locale: 'ja-JP',
        createdAt: now,
        updatedAt: now,
      });

      const guildRows = await client.db
        .select()
        .from(sqliteSchema.guildSettings)
        .where(eq(sqliteSchema.guildSettings.guildId, '987654321098765432'));

      expect(guildRows).toHaveLength(1);
      expect(guildRows[0]?.prefix).toBe('?');
      expect(guildRows[0]?.locale).toBe('ja-JP');
    });

    it('inserts and queries economy balances and moderation cases', async () => {
      const now = new Date();

      // Economy Balance
      await client.db.insert(sqliteSchema.economyBalances).values({
        userId: '123456789012345678',
        walletBalance: 5000,
        bankBalance: 12000,
        updatedAt: now,
      });

      const balanceRows = await client.db
        .select()
        .from(sqliteSchema.economyBalances)
        .where(eq(sqliteSchema.economyBalances.userId, '123456789012345678'));

      expect(balanceRows).toHaveLength(1);
      expect(balanceRows[0]?.walletBalance).toBe(5000);
      expect(balanceRows[0]?.bankBalance).toBe(12000);

      // Moderation Case
      await client.db.insert(sqliteSchema.moderationCases).values({
        id: 'mod-case-uuid-1',
        guildId: '987654321098765432',
        caseNumber: 1,
        type: 'WARN',
        targetUserId: '123456789012345678',
        moderatorUserId: '999999999999999999',
        reason: 'Spamming emojis in general chat',
        createdAt: now,
      });

      const modRows = await client.db
        .select()
        .from(sqliteSchema.moderationCases)
        .where(eq(sqliteSchema.moderationCases.caseNumber, 1));

      expect(modRows).toHaveLength(1);
      expect(modRows[0]?.type).toBe('WARN');
      expect(modRows[0]?.reason).toBe('Spamming emojis in general chat');
    });

    it('inserts and queries Waifu TCG cards and player energy', async () => {
      const now = new Date();

      // Waifu Card
      await client.db.insert(sqliteSchema.waifuCards).values({
        id: 'card-uuid-001',
        assetId: 'asset-uuid-001',
        name: 'Ririko [Celestial Maiden]',
        rarity: 'MYTHIC',
        element: 'ICE',
        attack: 850,
        defense: 720,
        speed: 910,
        health: 2400,
        critRate: 0.15,
        skillName: 'Absolute Zero Burst',
        skillDescription: 'Deals 250% Ice damage and freezes target for 1 turn.',
        collectionNumber: 1,
      });

      const cards = await client.db
        .select()
        .from(sqliteSchema.waifuCards)
        .where(eq(sqliteSchema.waifuCards.id, 'card-uuid-001'));

      expect(cards).toHaveLength(1);
      expect(cards[0]?.name).toBe('Ririko [Celestial Maiden]');
      expect(cards[0]?.rarity).toBe('MYTHIC');
      expect(cards[0]?.element).toBe('ICE');

      // Player Energy
      await client.db.insert(sqliteSchema.playerEnergy).values({
        userId: '123456789012345678',
        currentEnergy: 85,
        maxEnergy: 100,
        bonusEnergy: 20,
        lastReplenishedAt: now,
        lastResetDate: '2026-09-15',
        updatedAt: now,
      });

      const energy = await client.db
        .select()
        .from(sqliteSchema.playerEnergy)
        .where(eq(sqliteSchema.playerEnergy.userId, '123456789012345678'));

      expect(energy).toHaveLength(1);
      expect(energy[0]?.currentEnergy).toBe(85);
      expect(energy[0]?.bonusEnergy).toBe(20);
    });
  });
});
