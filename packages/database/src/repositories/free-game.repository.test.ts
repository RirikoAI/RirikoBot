import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabaseClient } from '../client/factory.js';
import type { SqliteDatabaseClient } from '../client/types.js';
import { FreeGameRepository } from './free-game.repository.js';

describe('FreeGameRepository (TASK-0811)', () => {
  let client: SqliteDatabaseClient;
  let freeGameRepo: FreeGameRepository;

  beforeEach(async () => {
    const rawClient = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (rawClient.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = rawClient;

    client.raw.exec(`
      CREATE TABLE free_games (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        title TEXT NOT NULL,
        store_url TEXT NOT NULL,
        thumbnail_url TEXT,
        start_date INTEGER NOT NULL,
        end_date INTEGER NOT NULL
      );

      CREATE TABLE free_game_announcements (
        game_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        announced_at INTEGER NOT NULL,
        PRIMARY KEY (game_id, guild_id)
      );

      CREATE TABLE free_game_channels (
        guild_id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);

    freeGameRepo = new FreeGameRepository(client);
  });

  afterEach(async () => {
    await client.close();
  });

  describe('Free Games Catalog Management', () => {
    it('should upsert and retrieve free game by id', async () => {
      const now = new Date('2026-09-17T20:00:00.000Z');
      const endDate = new Date('2026-09-24T20:00:00.000Z');

      const game = await freeGameRepo.upsertFreeGame({
        id: 'epic_fallout_classic',
        provider: 'EPIC',
        title: 'Fallout: A Post Nuclear Role Playing Game',
        storeUrl: 'https://store.epicgames.com/p/fallout',
        thumbnailUrl: 'https://example.com/fallout.jpg',
        startDate: now,
        endDate: endDate,
      });

      expect(game.id).toBe('epic_fallout_classic');
      expect(game.provider).toBe('EPIC');
      expect(game.title).toContain('Fallout');

      const found = await freeGameRepo.findById('epic_fallout_classic');
      expect(found).not.toBeNull();
      expect(found?.storeUrl).toBe('https://store.epicgames.com/p/fallout');

      // Update existing
      const updated = await freeGameRepo.upsertFreeGame({
        id: 'epic_fallout_classic',
        provider: 'EPIC',
        title: 'Fallout 1 (Classic)',
        storeUrl: 'https://store.epicgames.com/p/fallout-classic',
        thumbnailUrl: 'https://example.com/fallout-new.jpg',
        startDate: now,
        endDate: endDate,
      });

      expect(updated.title).toBe('Fallout 1 (Classic)');
      expect(updated.storeUrl).toBe('https://store.epicgames.com/p/fallout-classic');
    });

    it('should list only active games (where endDate > now)', async () => {
      const pastStart = new Date('2026-09-01T00:00:00.000Z');
      const pastEnd = new Date('2026-09-08T00:00:00.000Z');

      const activeStart = new Date('2026-09-15T00:00:00.000Z');
      const activeEnd = new Date('2026-09-22T00:00:00.000Z');

      await freeGameRepo.create({
        id: 'expired_game',
        provider: 'EPIC',
        title: 'Expired Game',
        storeUrl: 'https://example.com/expired',
        thumbnailUrl: null,
        startDate: pastStart,
        endDate: pastEnd,
      });

      await freeGameRepo.create({
        id: 'active_game',
        provider: 'STEAM',
        title: 'Active Game',
        storeUrl: 'https://example.com/active',
        thumbnailUrl: null,
        startDate: activeStart,
        endDate: activeEnd,
      });

      const checkTime = new Date('2026-09-17T12:00:00.000Z');
      const activeList = await freeGameRepo.listActiveFreeGames(checkTime);

      expect(activeList).toHaveLength(1);
      expect(activeList[0]?.id).toBe('active_game');
    });
  });

  describe('Announcement Tracking & Deduplication', () => {
    it('should track and deduplicate announcements per guild', async () => {
      const isAnnouncedBefore = await freeGameRepo.isGameAnnounced('game_xyz', 'guild_1');
      expect(isAnnouncedBefore).toBe(false);

      await freeGameRepo.recordAnnouncement({
        gameId: 'game_xyz',
        guildId: 'guild_1',
        channelId: 'channel_10',
        messageId: 'msg_100',
      });

      const isAnnouncedAfter = await freeGameRepo.isGameAnnounced('game_xyz', 'guild_1');
      expect(isAnnouncedAfter).toBe(true);

      // Different guild should return false
      const isAnnouncedGuild2 = await freeGameRepo.isGameAnnounced('game_xyz', 'guild_2');
      expect(isAnnouncedGuild2).toBe(false);

      const announcements = await freeGameRepo.listAnnouncementsByGuild('guild_1');
      expect(announcements).toHaveLength(1);
      expect(announcements[0]?.gameId).toBe('game_xyz');
      expect(announcements[0]?.messageId).toBe('msg_100');
    });
  });

  describe('Guild Channel Configuration', () => {
    it('should set, update, get and remove free games alert channel for a guild', async () => {
      // 1. Initial state: not configured
      const initialChannel = await freeGameRepo.getGuildChannel('guild_alpha');
      expect(initialChannel).toBeNull();

      // 2. Set channel
      const created = await freeGameRepo.setGuildChannel('guild_alpha', 'channel_alpha_1');
      expect(created.guildId).toBe('guild_alpha');
      expect(created.channelId).toBe('channel_alpha_1');

      const fetchedChannel = await freeGameRepo.getGuildChannel('guild_alpha');
      expect(fetchedChannel).toBe('channel_alpha_1');

      // 3. Update channel
      const updated = await freeGameRepo.setGuildChannel('guild_alpha', 'channel_alpha_2');
      expect(updated.channelId).toBe('channel_alpha_2');

      const updatedChannel = await freeGameRepo.getGuildChannel('guild_alpha');
      expect(updatedChannel).toBe('channel_alpha_2');

      // 4. List all configured channels
      await freeGameRepo.setGuildChannel('guild_beta', 'channel_beta_1');
      const allChannels = await freeGameRepo.listAllConfiguredGuildChannels();
      expect(allChannels).toHaveLength(2);
      expect(allChannels.map((c) => c.guildId)).toContain('guild_alpha');
      expect(allChannels.map((c) => c.guildId)).toContain('guild_beta');

      // 5. Remove channel
      const removed = await freeGameRepo.removeGuildChannel('guild_alpha');
      expect(removed).toBe(true);

      const afterRemove = await freeGameRepo.getGuildChannel('guild_alpha');
      expect(afterRemove).toBeNull();

      const remaining = await freeGameRepo.listAllConfiguredGuildChannels();
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.guildId).toBe('guild_beta');
    });
  });
});
