import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import DatabaseConstructor from 'better-sqlite3';
import type Database from 'better-sqlite3';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { unlinkSync, existsSync } from 'node:fs';
import { LegacySqliteInspector } from './inspector.js';
import { LegacyTransformer } from './transformer.js';

describe('Legacy 1.4.0 SQLite Migration Engine & Transformer', () => {
  let tempDbPath: string;
  let rawDb: Database.Database;

  beforeEach(() => {
    tempDbPath = join(
      tmpdir(),
      `legacy_test_${Date.now()}_${Math.random().toString(36).slice(2)}.sqlite`,
    );
    rawDb = new (DatabaseConstructor as unknown as typeof Database)(tempDbPath);

    // Create 17 legacy tables matching 1.4.0 TypeORM schema
    rawDb.exec(`
      CREATE TABLE user (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        displayName TEXT,
        backgroundImageURL TEXT,
        karma INTEGER DEFAULT 0,
        coins INTEGER DEFAULT 0,
        pointsSuspended INTEGER DEFAULT 0,
        commandsSuspended INTEGER DEFAULT 0,
        doNotNotifyOnLevelUp INTEGER DEFAULT 0,
        warns INTEGER DEFAULT 0,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE guild (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        prefix TEXT DEFAULT '!'
      );

      CREATE TABLE guild_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        value TEXT NOT NULL,
        guildId TEXT NOT NULL
      );

      CREATE TABLE configuration (
        applicationId TEXT PRIMARY KEY,
        twitchClientId TEXT,
        twitchClientSecret TEXT,
        stableDiffusionType TEXT,
        stableDiffusionApiToken TEXT
      );

      CREATE TABLE user_note (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        note TEXT NOT NULL,
        createdBy TEXT NOT NULL,
        userId TEXT NOT NULL,
        guildId TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE voice_channel (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        parentId TEXT,
        guildId TEXT NOT NULL
      );

      CREATE TABLE music_channel (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        guildId TEXT NOT NULL
      );

      CREATE TABLE playlist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        userId TEXT,
        author TEXT,
        authorTag TEXT,
        public INTEGER DEFAULT 0,
        plays INTEGER DEFAULT 0,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );

      CREATE TABLE track (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        playlistId INTEGER NOT NULL
      );

      CREATE TABLE stream_subscription (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        twitchUserId TEXT NOT NULL,
        channelId TEXT NOT NULL,
        guildId TEXT NOT NULL,
        createdAt TEXT,
        updatedAt TEXT
      );

      CREATE TABLE stream_notification (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        twitchUserId TEXT NOT NULL,
        channelId TEXT NOT NULL,
        streamId TEXT NOT NULL,
        notified INTEGER DEFAULT 0,
        guildId TEXT NOT NULL,
        createdAt TEXT,
        updatedAt TEXT
      );

      CREATE TABLE twitch_streamer (
        twitchUserId TEXT PRIMARY KEY,
        isLive INTEGER DEFAULT 0,
        createdAt TEXT,
        updatedAt TEXT
      );

      CREATE TABLE reaction_role (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        messageId TEXT NOT NULL,
        emoji TEXT NOT NULL,
        roleId TEXT NOT NULL,
        guildId TEXT NOT NULL
      );

      CREATE TABLE reminder (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        channelId TEXT NOT NULL,
        guildId TEXT,
        message TEXT NOT NULL,
        scheduledTime TEXT NOT NULL,
        sent INTEGER DEFAULT 0,
        timezone TEXT,
        createdAt TEXT,
        updatedAt TEXT
      );

      CREATE TABLE free_game_notification (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gameId TEXT NOT NULL,
        gameName TEXT NOT NULL,
        source TEXT NOT NULL,
        notified INTEGER DEFAULT 0,
        guildId TEXT NOT NULL,
        createdAt TEXT,
        updatedAt TEXT
      );

      CREATE TABLE item_category (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      );

      CREATE TABLE item (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        price INTEGER NOT NULL,
        description TEXT NOT NULL,
        rarity INTEGER DEFAULT 1,
        hidden INTEGER DEFAULT 0,
        purchaseLimit INTEGER DEFAULT 0,
        purchasable INTEGER DEFAULT 1,
        sellable INTEGER DEFAULT 1,
        findable INTEGER DEFAULT 1,
        imageUrl TEXT,
        createdAt TEXT,
        updatedAt TEXT,
        categoryId TEXT
      );
    `);

    // Insert sample legacy data
    const nowIso = new Date().toISOString();

    rawDb.exec(`
      INSERT INTO user VALUES 
        ('user_alice', 'Alice', 'Alice Wonderland', 'https://bg.jpg', 250, 1500, 0, 0, 0, 1, '${nowIso}', '${nowIso}'),
        ('user_bob', 'Bob', 'Builder Bob', NULL, 50, 300, 0, 0, 1, 0, '${nowIso}', '${nowIso}'),
        ('user_charlie', 'Charlie', 'Banned Charlie', NULL, 0, 0, 1, 0, 0, 5, '${nowIso}', '${nowIso}');

      INSERT INTO guild VALUES
        ('guild_alpha', 'Alpha Server', '!'),
        ('guild_beta', 'Beta Server', '?');

      INSERT INTO guild_config (name, value, guildId) VALUES
        ('welcomer.channel', 'chan_welcome', 'guild_alpha'),
        ('welcomer.enabled', 'true', 'guild_alpha'),
        ('welcomer.bg', 'https://welcome.png', 'guild_alpha');

      INSERT INTO user_note (note, createdBy, userId, guildId, createdAt, updatedAt) VALUES
        ('Helpful contributor', 'user_alice', 'user_bob', 'guild_alpha', '${nowIso}', '${nowIso}');

      INSERT INTO voice_channel VALUES
        ('vc_main', 'Join to Create', 'cat_voice', 'guild_alpha');

      INSERT INTO music_channel VALUES
        ('chan_music', 'music-room', 'guild_alpha');

      INSERT INTO playlist (id, name, userId, author, authorTag, public, plays, createdAt, updatedAt) VALUES
        (1, 'Favorites', 'user_alice', 'Alice', 'Alice#0001', 1, 42, '${nowIso}', '${nowIso}');

      INSERT INTO track (id, name, url, playlistId) VALUES
        (10, 'Song 1', 'https://youtube.com/watch?v=1', 1),
        (11, 'Song 2', 'https://youtube.com/watch?v=2', 1);

      INSERT INTO stream_subscription (twitchUserId, channelId, guildId, createdAt, updatedAt) VALUES
        ('twitch_streamer_1', 'chan_streams', 'guild_alpha', '${nowIso}', '${nowIso}');

      INSERT INTO twitch_streamer (twitchUserId, isLive, createdAt, updatedAt) VALUES
        ('twitch_streamer_1', 1, '${nowIso}', '${nowIso}');

      INSERT INTO reaction_role (messageId, emoji, roleId, guildId) VALUES
        ('msg_roles', '⭐', 'role_vip', 'guild_alpha');

      INSERT INTO reminder (id, userId, channelId, guildId, message, scheduledTime, sent, createdAt, updatedAt) VALUES
        ('rem_1', 'user_alice', 'chan_general', 'guild_alpha', 'Meeting in 1h', '${nowIso}', 0, '${nowIso}', '${nowIso}');

      INSERT INTO free_game_notification (gameId, gameName, source, notified, guildId, createdAt, updatedAt) VALUES
        ('epic_game_99', 'Awesome Free Game', 'EPIC', 1, 'guild_alpha', '${nowIso}', '${nowIso}');

      INSERT INTO item_category VALUES
        ('cat_roles', 'Roles');

      INSERT INTO item VALUES
        ('item_vip', 'VIP Pass', 500, 'Grants VIP role', 2, 0, 1, 1, 0, 0, 'https://vip.png', '${nowIso}', '${nowIso}', 'cat_roles');
    `);

    rawDb.close();
  });

  afterEach(() => {
    if (existsSync(tempDbPath)) {
      try {
        unlinkSync(tempDbPath);
      } catch {
        // ignore cleanup error
      }
    }
  });

  describe('LegacySqliteInspector', () => {
    it('audits legacy SQLite database in readonly mode without mutating file', () => {
      const inspector = new LegacySqliteInspector(tempDbPath);
      const summary = inspector.inspect();
      inspector.close();

      expect(summary.totalUsers).toBe(3);
      expect(summary.totalCoins).toBe(1800n); // 1500 + 300 + 0
      expect(summary.totalKarma).toBe(300n); // 250 + 50 + 0
      expect(summary.totalGuilds).toBe(2);
      expect(summary.tables['user']).toBe(3);
      expect(summary.tables['guild']).toBe(2);
      expect(summary.tables['playlist']).toBe(1);
      expect(summary.tables['track']).toBe(2);
      expect(summary.anomalies.length).toBe(0);
    });
  });

  describe('LegacyTransformer', () => {
    it('transforms all 17 legacy entities into 2.0 normalized models with exact coins conservation', () => {
      const inspector = new LegacySqliteInspector(tempDbPath);
      const db = inspector.open();
      const transformer = new LegacyTransformer(db);
      const data = transformer.transform();
      inspector.close();

      // 1. Users & Economy Balances
      expect(data.users.length).toBe(3);
      const alice = data.users.find((u) => u.id === 'user_alice');
      expect(alice?.username).toBe('Alice');
      expect(alice?.isBlacklisted).toBe(false);

      const charlie = data.users.find((u) => u.id === 'user_charlie');
      expect(charlie?.isBlacklisted).toBe(true);

      // Verify Currency Sum Conservation
      const totalCoinsMigrated = data.economyBalances.reduce(
        (sum, b) => sum + BigInt(b.walletBalance ?? 0),
        0n,
      );
      expect(totalCoinsMigrated).toBe(1800n);

      // Verify Initial Double-Entry Ledger Transactions
      expect(data.economyTransactions.length).toBe(2); // Alice (1500) and Bob (300)
      const aliceTx = data.economyTransactions.find((tx) => tx.userId === 'user_alice');
      expect(aliceTx?.amount).toBe(1500);
      expect(aliceTx?.type).toBe('MIGRATION_V1');
      expect(aliceTx?.source).toBe('LEGACY_MIGRATION');

      // 2. Guilds & Pivoted GuildSettings
      expect(data.guilds.length).toBe(2);
      expect(data.guildSettings.length).toBe(2);
      const alphaSettings = data.guildSettings.find((s) => s.guildId === 'guild_alpha');
      expect(alphaSettings?.welcomerEnabled).toBe(true);
      expect(alphaSettings?.welcomerChannelId).toBe('chan_welcome');
      expect(alphaSettings?.welcomerBg).toBe('https://welcome.png');
      expect(alphaSettings?.prefix).toBe('!');

      // 3. User Notes
      expect(data.moderationNotes.length).toBe(1);
      expect(data.moderationNotes[0]?.content).toBe('Helpful contributor');
      expect(data.moderationNotes[0]?.authorUserId).toBe('user_alice');

      // 4. Voice Channels (AVC)
      expect(data.autoVoiceConfigs.length).toBe(1);
      expect(data.autoVoiceConfigs[0]?.guildId).toBe('guild_alpha');

      // 5. Music Channels
      expect(data.musicChannels.length).toBe(1);
      expect(data.musicChannels[0]?.channelId).toBe('chan_music');

      // 6. Playlists & Tracks
      expect(data.musicSavedPlaylists.length).toBe(1);
      expect(data.musicSavedPlaylists[0]?.name).toBe('Favorites');
      expect(data.musicSavedPlaylists[0]?.playCount).toBe(42);
      expect(data.musicPlaylistTracks.length).toBe(2);
      expect(data.musicPlaylistTracks[0]?.title).toBe('Song 1');
      expect(data.musicPlaylistTracks[1]?.title).toBe('Song 2');

      // 7. Streamers & Subscriptions
      expect(data.streamers.length).toBe(1);
      expect(data.streamers[0]?.platform).toBe('TWITCH');
      expect(data.streamSubscriptions.length).toBe(1);

      // 8. Reaction Roles
      expect(data.reactionRoles.length).toBe(1);
      expect(data.reactionRoles[0]?.emojiOrComponentId).toBe('⭐');

      // 9. Reminders
      expect(data.reminders.length).toBe(1);
      expect(data.reminders[0]?.message).toBe('Meeting in 1h');

      // 10. Free Game Announcements
      expect(data.freeGameAnnouncements.length).toBe(1);
      expect(data.freeGameAnnouncements[0]?.gameId).toBe('epic_game_99');

      // 11. Shop Categories & Items
      expect(data.economyItemCategories.length).toBe(1);
      expect(data.economyItemCategories[0]?.name).toBe('Roles');
      expect(data.economyItems.length).toBe(1);
      expect(data.economyItems[0]?.name).toBe('VIP Pass');
      expect(data.economyItems[0]?.price).toBe(500);
    });
  });

  describe('MigrationEngine (Dry-Run, Execution & Verification)', () => {
    it('executes dry-run without mutating target, live migration with atomic conservation, and verifies integrity', async () => {
      const { createDatabaseClient } = await import('../client/factory.js');
      const { MigrationEngine } = await import('./engine.js');

      const targetClient = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
      if (targetClient.dialect !== 'sqlite') throw new Error('Expected sqlite');

      // Create target 2.0.0 tables
      targetClient.raw.exec(`
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

        CREATE TABLE economy_balances (
          user_id TEXT PRIMARY KEY,
          wallet_balance INTEGER NOT NULL DEFAULT 0,
          bank_balance INTEGER NOT NULL DEFAULT 0,
          bank_capacity INTEGER NOT NULL DEFAULT 10000,
          net_worth INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE economy_transactions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          guild_id TEXT,
          type TEXT NOT NULL,
          amount INTEGER NOT NULL,
          currency TEXT NOT NULL DEFAULT 'CREDITS',
          balance_before INTEGER NOT NULL,
          balance_after INTEGER NOT NULL,
          source TEXT NOT NULL,
          metadata TEXT DEFAULT '{}',
          created_at INTEGER NOT NULL
        );

        CREATE TABLE xp_accounts (
          user_id TEXT NOT NULL,
          guild_id TEXT NOT NULL,
          xp INTEGER NOT NULL DEFAULT 0,
          level INTEGER NOT NULL DEFAULT 0,
          karma INTEGER NOT NULL DEFAULT 0,
          last_xp_at INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (user_id, guild_id)
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

        CREATE TABLE moderation_notes (
          id TEXT PRIMARY KEY,
          guild_id TEXT NOT NULL,
          target_user_id TEXT NOT NULL,
          author_user_id TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE auto_voice_configs (
          id TEXT PRIMARY KEY,
          guild_id TEXT NOT NULL,
          parent_channel_id TEXT NOT NULL,
          channel_name_template TEXT NOT NULL DEFAULT "{user}'s Room",
          user_limit INTEGER NOT NULL DEFAULT 0,
          bitrate INTEGER NOT NULL DEFAULT 64000
        );

        CREATE TABLE music_channels (
          guild_id TEXT PRIMARY KEY,
          channel_id TEXT NOT NULL,
          last_message_id TEXT
        );

        CREATE TABLE music_saved_playlists (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          is_public INTEGER NOT NULL DEFAULT 0,
          play_count INTEGER NOT NULL DEFAULT 0,
          guild_id TEXT,
          created_at INTEGER NOT NULL
        );

        CREATE TABLE music_playlist_tracks (
          id TEXT PRIMARY KEY,
          playlist_id TEXT NOT NULL,
          title TEXT NOT NULL,
          url TEXT NOT NULL,
          duration INTEGER NOT NULL,
          thumbnail_url TEXT,
          position INTEGER NOT NULL
        );

        CREATE TABLE streamers (
          id TEXT PRIMARY KEY,
          platform TEXT NOT NULL,
          platform_user_id TEXT NOT NULL,
          username TEXT NOT NULL,
          display_name TEXT,
          avatar_url TEXT,
          is_live INTEGER NOT NULL DEFAULT 0,
          last_checked_at INTEGER NOT NULL
        );

        CREATE TABLE stream_subscriptions (
          id TEXT PRIMARY KEY,
          streamer_id TEXT NOT NULL,
          guild_id TEXT NOT NULL,
          channel_id TEXT NOT NULL,
          custom_message TEXT,
          mention_role_id TEXT,
          created_at INTEGER NOT NULL
        );

        CREATE TABLE reaction_roles (
          id TEXT PRIMARY KEY,
          guild_id TEXT NOT NULL,
          channel_id TEXT NOT NULL,
          message_id TEXT NOT NULL,
          emoji_or_component_id TEXT NOT NULL,
          role_id TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'EMOJI',
          mode TEXT NOT NULL DEFAULT 'TOGGLE',
          group_id TEXT,
          label TEXT,
          description TEXT
        );

        CREATE TABLE reminders (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          guild_id TEXT,
          channel_id TEXT NOT NULL,
          message TEXT NOT NULL,
          trigger_at INTEGER NOT NULL,
          repeat_interval TEXT NOT NULL DEFAULT 'NONE',
          is_completed INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE free_game_announcements (
          game_id TEXT NOT NULL,
          guild_id TEXT NOT NULL,
          channel_id TEXT NOT NULL,
          message_id TEXT NOT NULL,
          announced_at INTEGER NOT NULL,
          PRIMARY KEY (game_id, guild_id)
        );

        CREATE TABLE economy_item_categories (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT
        );

        CREATE TABLE economy_items (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL,
          price INTEGER NOT NULL,
          rarity TEXT NOT NULL DEFAULT 'COMMON',
          category_id TEXT,
          icon_url TEXT,
          is_purchasable INTEGER NOT NULL DEFAULT 1,
          metadata TEXT DEFAULT '{}'
        );
      `);

      const engine = new MigrationEngine();

      // 1. Dry Run Test
      const dryResult = await engine.migrate(tempDbPath, targetClient, { dryRun: true });
      expect(dryResult.isDryRun).toBe(true);
      expect(dryResult.coinsConserved).toBe(true);
      expect(dryResult.totalCoinsMigrated).toBe(1800n);
      expect(dryResult.migratedCounts.users).toBe(3);

      // Verify target is still empty
      const targetUserCountBefore = targetClient.raw
        .prepare('SELECT count(*) as c FROM users')
        .get() as { c: number };
      expect(targetUserCountBefore.c).toBe(0);

      // 2. Live Execution Test
      const liveResult = await engine.migrate(tempDbPath, targetClient, { dryRun: false });
      expect(liveResult.isDryRun).toBe(false);
      expect(liveResult.coinsConserved).toBe(true);
      expect(liveResult.totalCoinsMigrated).toBe(1800n);

      // Verify target rows populated
      const targetUserCountAfter = targetClient.raw
        .prepare('SELECT count(*) as c FROM users')
        .get() as { c: number };
      expect(targetUserCountAfter.c).toBe(3);

      const targetGuildCountAfter = targetClient.raw
        .prepare('SELECT count(*) as c FROM guilds')
        .get() as { c: number };
      expect(targetGuildCountAfter.c).toBe(2);

      // 3. Verification Test
      const verification = await engine.verify(tempDbPath, targetClient);
      expect(verification.ok).toBe(true);
      expect(verification.legacyCoins).toBe(1800n);
      expect(verification.targetCoins).toBe(1800n);
      expect(verification.legacyUsers).toBe(3);
      expect(verification.targetUsers).toBe(3);

      await targetClient.close();
    });
  });
});
