import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import DatabaseConstructor from 'better-sqlite3';
import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { LegacySqliteInspector } from './inspector.js';
import { LegacyTransformer, parseLegacyDate } from './transformer.js';
import { legacyUuid, uuidV5 } from './uuid.js';

/** Schema of a real 1.4.0 database, taken from the published image (see the file header). */
const LEGACY_SCHEMA = readFileSync(
  new URL('./__fixtures__/legacy-1.4.0-schema.sql', import.meta.url),
  'utf8',
);

/** How TypeORM's SQLite driver writes a Date: UTC, no zone. */
const ALICE_CREATED = '2025-03-04 05:06:07.890';
const REMINDER_DUE = '2025-03-04 05:06:07.890';

describe('uuidV5 (TASK-1661)', () => {
  it('matches the RFC 9562 example', () => {
    // Version 5 UUID for "www.example.com" in the DNS namespace.
    expect(uuidV5('6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'www.example.com')).toBe(
      '2ed6657d-e927-568b-95e1-2665a8aea6a2',
    );
  });
});

describe('parseLegacyDate', () => {
  // A host time zone ahead of UTC, so reading TypeORM's UTC text as local time would show.
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'Asia/Kuala_Lumpur';
  });
  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  it('reads TypeORM SQLite datetimes as UTC', () => {
    expect(parseLegacyDate('2025-03-04 05:06:07.890').toISOString()).toBe(
      '2025-03-04T05:06:07.890Z',
    );
    // `datetime('now')` column defaults have no milliseconds.
    expect(parseLegacyDate('2025-03-04 05:06:07').toISOString()).toBe('2025-03-04T05:06:07.000Z');
  });

  it('keeps ISO strings with a zone, epoch numbers and Date objects as they are', () => {
    expect(parseLegacyDate('2025-03-04T05:06:07.000+08:00').toISOString()).toBe(
      '2025-03-03T21:06:07.000Z',
    );
    expect(parseLegacyDate(Date.UTC(2025, 0, 1)).toISOString()).toBe('2025-01-01T00:00:00.000Z');
    const date = new Date(Date.UTC(2024, 5, 6));
    expect(parseLegacyDate(date)).toBe(date);
  });
});

describe('Legacy 1.4.0 SQLite Migration Engine & Transformer', () => {
  let tempDbPath: string;

  function sha256(path: string): string {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
  }

  beforeEach(() => {
    tempDbPath = join(
      tmpdir(),
      `legacy_test_${Date.now()}_${Math.random().toString(36).slice(2)}.sqlite`,
    );
    const rawDb: Database.Database = new (DatabaseConstructor as unknown as typeof Database)(
      tempDbPath,
    );
    // 1.4.0 ran with foreign keys on (TypeORM sets the pragma), so rows must reference real parents.
    rawDb.pragma('foreign_keys = ON');
    rawDb.exec(LEGACY_SCHEMA);

    rawDb.exec(`
      INSERT INTO "user" (id, username, displayName, karma, coins, pointsSuspended, commandsSuspended, doNotNotifyOnLevelUp, warns, createdAt, updatedAt, backgroundImageURL) VALUES
        ('user_alice', 'Alice', 'Alice Wonderland', 250, 1500, 0, 0, 0, 1, '${ALICE_CREATED}', '${ALICE_CREATED}', 'https://bg.jpg');
      -- createdAt and updatedAt from the column defaults, as TypeORM leaves them.
      INSERT INTO "user" (id, username, displayName, karma, coins, doNotNotifyOnLevelUp) VALUES
        ('user_bob', 'Bob', 'Builder Bob', 50, 300, 1);
      INSERT INTO "user" (id, username, displayName, pointsSuspended, warns) VALUES
        ('user_charlie', 'Charlie', 'Banned Charlie', 1, 5);

      INSERT INTO guild (id, name, prefix) VALUES
        ('guild_alpha', 'Alpha Server', '!'),
        ('guild_beta', 'Beta Server', '?');

      -- Names and values as the 1.4.0 /welcomer, /farewell, /karma, /freegames and /twitch commands write them.
      INSERT INTO guild_config (name, value, guildId) VALUES
        ('welcomer_channel', 'chan_welcome', 'guild_alpha'),
        ('welcomer_enabled', 'true', 'guild_alpha'),
        ('welcomer_bg', 'https://welcome.png', 'guild_alpha'),
        ('farewell_channel', 'chan_bye', 'guild_alpha'),
        ('farewell_enabled', 'false', 'guild_alpha'),
        ('karma-notification-enabled', 'disabled', 'guild_beta'),
        ('freeGamesChannelId', 'chan_free', 'guild_alpha'),
        ('twitch_channel', 'chan_streams', 'guild_alpha');

      INSERT INTO configuration (applicationId, twitchClientId, twitchClientSecret) VALUES
        ('100000000000000001', 'twitch-client', 'twitch-secret');

      INSERT INTO user_note (note, createdBy, guildId, userId) VALUES
        ('Helpful contributor', 'user_alice', 'guild_alpha', 'user_bob');

      INSERT INTO voice_channel (id, name, parentId, guildId) VALUES
        ('vc_main', 'Join to Create', 'cat_voice', 'guild_alpha');

      INSERT INTO music_channel (id, name, guildId) VALUES
        ('chan_music', 'music-room', 'guild_alpha');

      INSERT INTO playlist (id, name, userId, author, authorTag, public, plays) VALUES
        (1, 'Favorites', 'user_alice', 'Alice', 'alice', 1, 42),
        (2, 'Chill', 'user_bob', 'Bob', 'bob', 0, 3);

      -- Interleaved ids: each playlist keeps its own order.
      INSERT INTO track (id, name, url, playlistId) VALUES
        (10, 'Song 1', 'https://youtube.com/watch?v=1', 1),
        (11, 'Calm 1', 'https://youtube.com/watch?v=3', 2),
        (12, 'Song 2', 'https://youtube.com/watch?v=2', 1);

      INSERT INTO stream_subscription (twitchUserId, channelId, guildId) VALUES
        ('twitch_streamer_1', 'chan_streams', 'guild_alpha');

      INSERT INTO stream_notification (twitchUserId, channelId, streamId, notified, guildId) VALUES
        ('twitch_streamer_1', 'chan_streams', 'stream_1', 1, 'guild_alpha');

      INSERT INTO twitch_streamer (twitchUserId, isLive) VALUES
        ('twitch_streamer_1', 1);

      INSERT INTO reaction_role (messageId, emoji, roleId, guildId) VALUES
        ('msg_roles', '⭐', 'role_vip', 'guild_alpha');

      -- 1.4.0 stored the literal 'DM' as the guild of direct-message reminders.
      INSERT INTO reminder (id, userId, channelId, guildId, message, scheduledTime, sent) VALUES
        ('rem_1', 'user_alice', 'chan_general', 'guild_alpha', 'Meeting in 1h', '${REMINDER_DUE}', 0),
        ('rem_2', 'user_alice', 'dm_channel', 'DM', 'Water plants', '2025-03-05 00:00:00', 1);

      INSERT INTO free_game_notification (gameId, gameName, source, notified, guildId) VALUES
        ('epic_game_99', 'Awesome Free Game', 'EPIC', 1, 'guild_alpha');

      INSERT INTO item_category (id, name) VALUES (1, 'Roles');

      INSERT INTO item (id, name, price, description, rarity, hidden, purchaseLimit, purchasable, sellable, findable, imageUrl, categoryId) VALUES
        (1, 'VIP Pass', 500, 'Grants VIP role', 2, 0, 1, 1, 0, 0, 'https://vip.png', 1),
        (2, 'Secret Badge', 0, 'Found, never sold', 5, 1, 0, 0, 0, 1, '', NULL);
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
      const before = sha256(tempDbPath);
      const inspector = new LegacySqliteInspector(tempDbPath);
      const summary = inspector.inspect();
      inspector.close();

      expect(summary.totalUsers).toBe(3);
      expect(summary.totalCoins).toBe(1800n); // 1500 + 300 + 0
      expect(summary.totalKarma).toBe(300n); // 250 + 50 + 0
      expect(summary.totalGuilds).toBe(2);
      expect(summary.tables['user']).toBe(3);
      expect(summary.tables['guild']).toBe(2);
      expect(summary.tables['playlist']).toBe(2);
      expect(summary.tables['track']).toBe(3);
      expect(summary.tables['stream_notification']).toBe(1);
      expect(summary.anomalies.length).toBe(0);
      expect(sha256(tempDbPath)).toBe(before);
    });
  });

  describe('LegacyTransformer', () => {
    const originalTz = process.env.TZ;
    beforeAll(() => {
      process.env.TZ = 'Asia/Kuala_Lumpur';
    });
    afterAll(() => {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    });

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
      expect(alice?.profileBackgroundUrl).toBe('https://bg.jpg');
      expect(alice?.createdAt?.toISOString()).toBe('2025-03-04T05:06:07.890Z');

      const bob = data.users.find((u) => u.id === 'user_bob');
      expect(bob?.notifyLevelUp).toBe(false);

      const charlie = data.users.find((u) => u.id === 'user_charlie');
      expect(charlie?.isBlacklisted).toBe(true);
      expect(charlie?.warnCount).toBe(5);

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
      expect(alphaSettings).toMatchObject({
        prefix: '!',
        welcomerEnabled: true,
        welcomerChannelId: 'chan_welcome',
        welcomerBg: 'https://welcome.png',
        farewellEnabled: false,
        farewellChannelId: 'chan_bye',
        karmaNotificationsEnabled: true,
      });
      const betaSettings = data.guildSettings.find((s) => s.guildId === 'guild_beta');
      expect(betaSettings).toMatchObject({ prefix: '?', karmaNotificationsEnabled: false });

      // 3. User Notes
      expect(data.moderationNotes.length).toBe(1);
      expect(data.moderationNotes[0]).toMatchObject({
        content: 'Helpful contributor',
        authorUserId: 'user_alice',
        targetUserId: 'user_bob',
        guildId: 'guild_alpha',
      });

      // 4. Voice Channels (AVC)
      expect(data.autoVoiceConfigs.length).toBe(1);
      expect(data.autoVoiceConfigs[0]?.guildId).toBe('guild_alpha');
      expect(data.autoVoiceConfigs[0]?.parentChannelId).toBe('cat_voice');

      // 5. Music Channels
      expect(data.musicChannels.length).toBe(1);
      expect(data.musicChannels[0]?.channelId).toBe('chan_music');

      // 6. Playlists & Tracks
      expect(data.musicSavedPlaylists.length).toBe(2);
      expect(data.musicSavedPlaylists[0]).toMatchObject({
        id: '1',
        name: 'Favorites',
        playCount: 42,
        isPublic: true,
        guildId: null,
      });
      expect(data.musicSavedPlaylists[1]).toMatchObject({ id: '2', isPublic: false });
      expect(data.musicPlaylistTracks.map((t) => [t.playlistId, t.title, t.position])).toEqual([
        ['1', 'Song 1', 0],
        ['2', 'Calm 1', 0],
        ['1', 'Song 2', 1],
      ]);

      // 7. Streamers & Subscriptions
      expect(data.streamers.length).toBe(1);
      expect(data.streamers[0]?.platform).toBe('TWITCH');
      expect(data.streamers[0]?.isLive).toBe(true);
      expect(data.streamSubscriptions.length).toBe(1);
      // uuid IDs (Postgres columns are uuid), derived so re-runs match and the link holds.
      expect(data.streamers[0]?.id).toBe(legacyUuid('twitch_streamer:twitch_streamer_1'));
      expect(data.streamers[0]?.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(data.streamSubscriptions[0]?.streamerId).toBe(data.streamers[0]?.id);

      // 8. Reaction Roles
      expect(data.reactionRoles.length).toBe(1);
      expect(data.reactionRoles[0]?.emojiOrComponentId).toBe('⭐');

      // 9. Reminders: due times are UTC whatever the host time zone.
      expect(data.reminders.length).toBe(2);
      expect(data.reminders[0]).toMatchObject({
        message: 'Meeting in 1h',
        guildId: 'guild_alpha',
        isCompleted: false,
      });
      expect(data.reminders[0]?.triggerAt?.toISOString()).toBe('2025-03-04T05:06:07.890Z');
      expect(data.reminders[1]).toMatchObject({
        message: 'Water plants',
        guildId: null,
        isCompleted: true,
      });
      expect(data.reminders[1]?.triggerAt?.toISOString()).toBe('2025-03-05T00:00:00.000Z');

      // 10. Free Game Announcements
      expect(data.freeGameAnnouncements.length).toBe(1);
      expect(data.freeGameAnnouncements[0]?.gameId).toBe('epic_game_99');

      // 11. Shop Categories & Items: SQLite booleans are 0 or 1.
      expect(data.economyItemCategories).toEqual([
        { id: '1', name: 'Roles', description: 'Roles' },
      ]);
      expect(data.economyItems.length).toBe(2);
      expect(data.economyItems[0]).toMatchObject({
        id: '1',
        name: 'VIP Pass',
        price: 500,
        categoryId: '1',
        iconUrl: 'https://vip.png',
        isPurchasable: true,
        metadata: {
          findable: false,
          sellable: false,
          hidden: false,
          purchaseLimit: 1,
          legacyRarity: 2,
        },
      });
      expect(data.economyItems[1]).toMatchObject({
        id: '2',
        categoryId: null,
        iconUrl: null,
        isPurchasable: false,
        metadata: { findable: true, hidden: true, legacyRarity: 5 },
      });
    });
  });

  describe('MigrationEngine (Dry-Run, Execution & Verification)', () => {
    it('executes dry-run without mutating target, live migration with atomic conservation, and verifies integrity', async () => {
      const { createDatabaseClient } = await import('../client/factory.js');
      const { MigrationEngine } = await import('./engine.js');

      // The real 2.0 schema, as a new install creates it.
      const targetClient = await createDatabaseClient({
        dialect: 'sqlite',
        url: ':memory:',
        autoMigrate: true,
      });
      if (targetClient.dialect !== 'sqlite') throw new Error('Expected sqlite');
      const legacyBefore = sha256(tempDbPath);
      const count = (table: string) =>
        (targetClient.raw.prepare(`SELECT count(*) as c FROM ${table}`).get() as { c: number }).c;

      const engine = new MigrationEngine();

      // 1. Dry Run Test
      const dryResult = await engine.migrate(tempDbPath, targetClient, { dryRun: true });
      expect(dryResult.isDryRun).toBe(true);
      expect(dryResult.coinsConserved).toBe(true);
      expect(dryResult.totalCoinsMigrated).toBe(1800n);
      expect(dryResult.migratedCounts.users).toBe(3);

      // Verify target is still empty
      expect(count('users')).toBe(0);

      // 2. Live Execution Test
      const liveResult = await engine.migrate(tempDbPath, targetClient, { dryRun: false });
      expect(liveResult.isDryRun).toBe(false);
      expect(liveResult.coinsConserved).toBe(true);
      expect(liveResult.totalCoinsMigrated).toBe(1800n);

      // Verify target rows populated
      expect(count('users')).toBe(3);
      expect(count('guilds')).toBe(2);
      expect(count('music_playlist_tracks')).toBe(3);
      expect(count('reminders')).toBe(2);
      expect(count('economy_items')).toBe(2);

      // 3. Verification Test
      const verification = await engine.verify(tempDbPath, targetClient);
      expect(verification.ok).toBe(true);
      expect(verification.legacyCoins).toBe(1800n);
      expect(verification.targetCoins).toBe(1800n);
      expect(verification.legacyUsers).toBe(3);
      expect(verification.targetUsers).toBe(3);

      // 4. Re-running inserts nothing twice (IDs are stable, conflicts are skipped).
      await engine.migrate(tempDbPath, targetClient, { dryRun: false });
      expect(count('users')).toBe(3);
      expect(count('music_playlist_tracks')).toBe(3);

      // The legacy file is never written.
      expect(sha256(tempDbPath)).toBe(legacyBefore);

      await targetClient.close();
    });
  });
});
