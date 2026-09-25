import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabaseClient } from '../client/factory.js';
import type { SqliteDatabaseClient } from '../client/types.js';
import { StreamRepository } from './stream.repository.js';

describe('StreamRepository (TASK-0801)', () => {
  let client: SqliteDatabaseClient;
  let streamRepo: StreamRepository;

  beforeEach(async () => {
    const rawClient = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (rawClient.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = rawClient;

    client.raw.exec(`
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

      CREATE TABLE stream_events (
        id TEXT PRIMARY KEY,
        streamer_id TEXT NOT NULL,
        stream_id TEXT NOT NULL,
        title TEXT NOT NULL,
        game_name TEXT,
        viewer_count INTEGER NOT NULL DEFAULT 0,
        started_at INTEGER NOT NULL,
        ended_at INTEGER
      );

      CREATE TABLE stream_announcements (
        id TEXT PRIMARY KEY,
        idempotency_key TEXT NOT NULL UNIQUE,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        announced_at INTEGER NOT NULL
      );

      CREATE TABLE stream_assets (
        stream_id TEXT PRIMARY KEY,
        original_url TEXT NOT NULL,
        discord_attachment_url TEXT NOT NULL,
        file_hash TEXT NOT NULL,
        cached_at INTEGER NOT NULL
      );
    `);

    streamRepo = new StreamRepository(client);
  });

  afterEach(async () => {
    await client.close();
  });

  describe('Streamer Management', () => {
    it('should upsert and find streamer by platform and platformUserId', async () => {
      const created = await streamRepo.upsertStreamer({
        platform: 'TWITCH',
        platformUserId: '123456',
        username: 'ririko_live',
        displayName: 'Ririko Live',
        avatarUrl: 'https://example.com/avatar.png',
        isLive: false,
      });

      expect(created.id).toBeDefined();
      expect(created.platform).toBe('TWITCH');
      expect(created.username).toBe('ririko_live');

      const found = await streamRepo.findByPlatformUser('TWITCH', '123456');
      expect(found).not.toBeNull();
      expect(found?.displayName).toBe('Ririko Live');

      // Case-insensitive platform lookup
      const foundLower = await streamRepo.findByPlatformUser('twitch', '123456');
      expect(foundLower?.id).toBe(created.id);
    });

    it('should find streamer by username case-insensitively', async () => {
      await streamRepo.upsertStreamer({
        platform: 'TWITCH',
        platformUserId: '999',
        username: 'CoolGamer',
      });

      const found = await streamRepo.findByUsername('twitch', 'coolgamer');
      expect(found).not.toBeNull();
      expect(found?.username).toBe('CoolGamer');
    });

    it('should update live status and lastCheckedAt', async () => {
      const streamer = await streamRepo.upsertStreamer({
        platform: 'YOUTUBE',
        platformUserId: 'yt-channel-1',
        username: 'yt_streamer',
        isLive: false,
      });

      expect(streamer.isLive).toBe(false);

      const checkTime = new Date('2026-09-17T21:00:00.000Z');
      await streamRepo.updateLiveStatus(streamer.id, true, checkTime);

      const updated = await streamRepo.findById(streamer.id);
      expect(updated?.isLive).toBe(true);
      expect(updated?.lastCheckedAt).toEqual(checkTime);
    });
  });

  describe('Stream Subscriptions', () => {
    it('should add, list, and remove subscriptions for guilds and streamers', async () => {
      const streamer = await streamRepo.upsertStreamer({
        platform: 'TWITCH',
        platformUserId: '555',
        username: 'streamer_555',
      });

      const sub = await streamRepo.addSubscription({
        streamerId: streamer.id,
        guildId: 'guild-100',
        channelId: 'channel-200',
        customMessage: 'Hey {role}, {streamer} is live playing {game}!',
        mentionRoleId: 'role-300',
      });

      expect(sub.id).toBeDefined();
      expect(sub.guildId).toBe('guild-100');

      const guildSubs = await streamRepo.getSubscriptionsByGuild('guild-100');
      expect(guildSubs).toHaveLength(1);
      expect(guildSubs[0]?.channelId).toBe('channel-200');

      const streamerSubs = await streamRepo.getSubscriptionsByStreamer(streamer.id);
      expect(streamerSubs).toHaveLength(1);

      const monitored = await streamRepo.listActiveMonitoredStreamers();
      expect(monitored).toHaveLength(1);
      expect(monitored[0]?.id).toBe(streamer.id);

      // Remove subscription
      const removed = await streamRepo.removeSubscription('guild-100', streamer.id);
      expect(removed).toBe(true);

      const remainingSubs = await streamRepo.getSubscriptionsByGuild('guild-100');
      expect(remainingSubs).toHaveLength(0);
    });
  });

  describe('Stream Events', () => {
    it('should record stream events and end them cleanly', async () => {
      const streamer = await streamRepo.upsertStreamer({
        platform: 'TIKTOK',
        platformUserId: 'tiktok-user-1',
        username: 'tiktok_live',
      });

      const startTime = new Date('2026-09-17T20:00:00.000Z');
      const event = await streamRepo.recordStreamEvent({
        streamerId: streamer.id,
        streamId: 'stream-xyz',
        title: 'Late Night Chatting',
        gameName: 'Just Chatting',
        viewerCount: 150,
        startedAt: startTime,
      });

      expect(event.streamId).toBe('stream-xyz');
      expect(event.endedAt).toBeNull();

      const endTime = new Date('2026-09-17T21:30:00.000Z');
      await streamRepo.endStreamEvent('stream-xyz', endTime);

      const rows = client.raw
        .prepare('SELECT * FROM stream_events WHERE stream_id = ?')
        .all('stream-xyz') as any[];
      expect(rows[0].ended_at).toBe(endTime.getTime());
    });
  });

  describe('Idempotency & Announcement Tracking', () => {
    it('should enforce exactly-once announcement detection with idempotency keys', async () => {
      const key = 'TWITCH:stream_123:guild_456:channel_789';

      expect(await streamRepo.isAnnounced(key)).toBe(false);

      await streamRepo.recordAnnouncement({
        idempotencyKey: key,
        guildId: 'guild_456',
        channelId: 'channel_789',
        messageId: 'msg_99999',
      });

      expect(await streamRepo.isAnnounced(key)).toBe(true);
    });
  });

  describe('Stream Asset Caching (CDN)', () => {
    it('should cache and retrieve thumbnail asset data', async () => {
      await streamRepo.saveCachedAsset({
        streamId: 'stream_abc',
        originalUrl: 'https://twitch.tv/thumb.jpg',
        discordAttachmentUrl: 'https://cdn.discordapp.com/attachments/123/thumb.jpg',
        fileHash: 'sha256-hash-xyz',
      });

      const cached = await streamRepo.getCachedAsset('stream_abc');
      expect(cached).not.toBeNull();
      expect(cached?.originalUrl).toBe('https://twitch.tv/thumb.jpg');
      expect(cached?.fileHash).toBe('sha256-hash-xyz');
    });
  });
});
