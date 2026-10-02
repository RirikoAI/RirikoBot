import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { LegacySqliteInspector } from './inspector.js';
import { LegacyTransformer, parseLegacyDate } from './transformer.js';
import { legacyUuid, uuidV5 } from './uuid.js';
import { createLegacyDatabase } from './__fixtures__/legacy-database.js';

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
    createLegacyDatabase(tempDbPath);
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
      expect(alphaSettings).toMatchObject({ prefix: '!', karmaNotificationsEnabled: true });
      // 2.0 reads the cards from guild_welcomer / guild_farewell, not guild_settings.
      expect(alphaSettings).not.toHaveProperty('welcomerChannelId');
      const betaSettings = data.guildSettings.find((s) => s.guildId === 'guild_beta');
      expect(betaSettings).toMatchObject({ prefix: '?', karmaNotificationsEnabled: false });

      // Welcome and farewell cards; guild_beta enabled a welcomer but never gave it a channel.
      expect(data.guildWelcomers).toEqual([
        {
          guildId: 'guild_alpha',
          channelId: 'chan_welcome',
          backgroundUrl: 'https://welcome.png',
          isEnabled: true,
        },
      ]);
      expect(data.guildFarewells).toEqual([
        {
          guildId: 'guild_alpha',
          channelId: 'chan_bye',
          backgroundUrl: 'https://bye.png',
          isEnabled: false,
        },
      ]);

      // Free games channel, AI model and image provider.
      expect(data.freeGameChannels).toEqual([{ guildId: 'guild_alpha', channelId: 'chan_free' }]);
      expect(data.aiGuildPreferences).toEqual([
        { guildId: 'guild_alpha', providerOverride: 'ollama', modelOverride: 'llama3.2' },
      ]);
      expect(data.imageGuildSettings).toEqual([
        { guildId: 'guild_alpha', defaultProvider: 'replicate' },
      ]);

      // What could not be carried over is reported, never the credential values.
      expect(data.notices).toEqual([
        'Guild guild_beta used the AI model "llama3:8b", which 2.0 does not offer; it uses the bot default now. Pick a model with /ai-model.',
        'Not migrated (1.4.0 stored them in plain text): Twitch client ID, Twitch client secret. Enter them again in the dashboard.',
      ]);
      expect(data.notices.join(' ')).not.toContain('twitch-secret');

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
      // Ids as 2.0 announces them, in the guild's free-games channel. guild_beta had no
      // channel, so it has nothing to suppress.
      expect(
        data.freeGameAnnouncements.map(({ gameId, guildId, channelId }) => ({
          gameId,
          guildId,
          channelId,
        })),
      ).toEqual([
        { gameId: 'epic-epic_game_99', guildId: 'guild_alpha', channelId: 'chan_free' },
        { gameId: 'steam-440', guildId: 'guild_alpha', channelId: 'chan_free' },
      ]);

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
      expect(liveResult.notices).toHaveLength(2);

      // Settings land in the tables 2.0 reads, as its repositories return them.
      const { WelcomerRepository } = await import('../repositories/welcomer.repository.js');
      const { FreeGameRepository } = await import('../repositories/free-game.repository.js');
      const welcomers = new WelcomerRepository(targetClient);
      expect(await welcomers.getWelcomeConfig('guild_alpha')).toMatchObject({
        channelId: 'chan_welcome',
        backgroundUrl: 'https://welcome.png',
        isEnabled: true,
        messageTemplate: 'Welcome to {server}, {user}!',
      });
      expect(await welcomers.getFarewellConfig('guild_alpha')).toMatchObject({
        channelId: 'chan_bye',
        isEnabled: false,
      });
      expect(await welcomers.getWelcomeConfig('guild_beta')).toBeNull();
      const freeGames = new FreeGameRepository(targetClient);
      expect(await freeGames.getGuildChannel('guild_alpha')).toMatchObject({
        channelId: 'chan_free',
      });
      expect(await freeGames.isGameAnnounced('steam-440', 'guild_alpha')).toBe(true);
      expect(count('ai_guild_preferences')).toBe(1);
      expect(count('image_guild_settings')).toBe(1);

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
      expect(count('guild_welcomer')).toBe(1);
      expect(count('free_game_announcements')).toBe(2);

      // The legacy file is never written.
      expect(sha256(tempDbPath)).toBe(legacyBefore);

      await targetClient.close();
    });
  });
});
