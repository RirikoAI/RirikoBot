import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDatabaseClient, StreamRepository } from '@ririko/database';
import type { SqliteDatabaseClient } from '@ririko/database';
import { StreamNotificationDispatcher } from '../dispatcher.js';
import type { LiveStreamInfo } from '../types.js';

describe('StreamNotificationDispatcher (TASK-0802)', () => {
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
        fileHash TEXT NOT NULL,
        cached_at INTEGER NOT NULL
      );
    `);

    streamRepo = new StreamRepository(client);
  });

  afterEach(async () => {
    await client.close();
  });

  describe('Template Formatting', () => {
    it('should interpolate placeholders accurately', () => {
      const dispatcher = new StreamNotificationDispatcher({} as any, streamRepo);
      const stream: LiveStreamInfo = {
        streamId: 's1',
        platform: 'TWITCH',
        streamerUsername: 'ririko_vt',
        streamerDisplayName: 'Ririko VT',
        title: 'Singing Stream & Chat',
        gameName: 'Music',
        viewerCount: 200,
        startedAt: new Date(),
        thumbnailUrl: 'https://example.com/thumb.jpg',
        streamUrl: 'https://twitch.tv/ririko_vt',
      };

      const template = 'Attention {role}! {streamer} is live playing {game}! Check it out at {url}';
      const formatted = dispatcher.formatMessage(template, stream, 'role_123');

      expect(formatted).toBe(
        'Attention <@&role_123>! Ririko VT is live playing Music! Check it out at https://twitch.tv/ririko_vt',
      );
    });

    it('should use default template when customMessage is undefined', () => {
      const dispatcher = new StreamNotificationDispatcher({} as any, streamRepo);
      const stream: LiveStreamInfo = {
        streamId: 's2',
        platform: 'YOUTUBE',
        streamerUsername: 'anime_gamer',
        title: 'Walkthrough Part 5',
        gameName: 'Elden Ring',
        viewerCount: 50,
        startedAt: new Date(),
        thumbnailUrl: 'https://example.com/thumb.jpg',
        streamUrl: 'https://youtube.com/watch?v=123',
      };

      const formatted = dispatcher.formatMessage(null, stream);
      expect(formatted).toContain('🔴 **anime_gamer** is now live on **YOUTUBE**!');
      expect(formatted).toContain('https://youtube.com/watch?v=123');
    });
  });

  describe('Discord Payload Building & Thumbnail Caching', () => {
    it('should download thumbnail, compute hash, and attach as Discord AttachmentBuilder', async () => {
      const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG header
      const mockFetch = vi.fn(async () => {
        return new Response(imageBytes, {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        });
      });

      const dispatcher = new StreamNotificationDispatcher({} as any, streamRepo, {
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const stream: LiveStreamInfo = {
        streamId: 'thumb_test_1',
        platform: 'TWITCH',
        streamerUsername: 'artist_chan',
        title: 'Drawing Waifus',
        gameName: 'Art',
        viewerCount: 88,
        startedAt: new Date(),
        thumbnailUrl: 'https://example.com/live_thumb.png',
        streamUrl: 'https://twitch.tv/artist_chan',
      };

      const payload = await dispatcher.buildNotificationPayload(stream);

      expect(payload.files).toHaveLength(1);
      expect(payload.embeds[0]?.data.image?.url).toBe('attachment://stream_thumb.jpg');

      // Check record in stream_assets
      const asset = await streamRepo.getCachedAsset('thumb_test_1');
      expect(asset).not.toBeNull();
      expect(asset?.discordAttachmentUrl).toBe('attachment://stream_thumb.jpg');
      expect(asset?.fileHash).toBeDefined();
    });

    it('should gracefully fallback to external URL if image download fails', async () => {
      const mockFetch = vi.fn(async () => {
        return new Response(null, { status: 404 });
      });

      const dispatcher = new StreamNotificationDispatcher({} as any, streamRepo, {
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const stream: LiveStreamInfo = {
        streamId: 'thumb_fail_1',
        platform: 'TWITCH',
        streamerUsername: 'artist_chan',
        title: 'Drawing Waifus',
        gameName: 'Art',
        viewerCount: 88,
        startedAt: new Date(),
        thumbnailUrl: 'https://example.com/404.png',
        streamUrl: 'https://twitch.tv/artist_chan',
      };

      const payload = await dispatcher.buildNotificationPayload(stream);
      expect(payload.files).toHaveLength(0);
      expect(payload.embeds[0]?.data.image?.url).toBe('https://example.com/404.png');
    });
  });

  describe('Dispatch & Idempotency Enforcement', () => {
    it('should dispatch alert to subscribed channels and prevent duplicate deliveries', async () => {
      // 1. Setup streamer & subscription in DB
      const streamer = await streamRepo.upsertStreamer({
        platform: 'TWITCH',
        platformUserId: 'tw_500',
        username: 'speedrunner',
      });

      await streamRepo.addSubscription({
        streamerId: streamer.id,
        guildId: 'guild_alpha',
        channelId: 'channel_news',
        customMessage: 'Speedrun alert: {streamer} is live!',
      });

      // 2. Mock Discord client
      const mockSend = vi.fn(async () => ({ id: 'discord_msg_777' }));
      const mockChannel = {
        id: 'channel_news',
        isTextBased: () => true,
        send: mockSend,
      };

      const mockClient = {
        channels: {
          fetch: vi.fn(async () => mockChannel),
        },
      } as any;

      const dispatcher = new StreamNotificationDispatcher(mockClient, streamRepo);

      const stream: LiveStreamInfo = {
        streamId: 'run_123',
        platform: 'TWITCH',
        streamerUsername: 'speedrunner',
        title: 'Any% Speedrun PB Pace',
        gameName: 'Super Mario 64',
        viewerCount: 1200,
        startedAt: new Date(),
        thumbnailUrl: 'https://example.com/mario.jpg',
        streamUrl: 'https://twitch.tv/speedrunner',
      };

      // 3. First dispatch
      const count1 = await dispatcher.dispatch(streamer, stream);
      expect(count1).toBe(1);
      expect(mockSend).toHaveBeenCalledTimes(1);

      // Verify idempotency record exists in stream_announcements
      const isAnnounced = await streamRepo.isAnnounced('TWITCH:run_123:guild_alpha:channel_news');
      expect(isAnnounced).toBe(true);

      // 4. Second dispatch for same stream session -> MUST BE SKIPPED
      const count2 = await dispatcher.dispatch(streamer, stream);
      expect(count2).toBe(0);
      expect(mockSend).toHaveBeenCalledTimes(1); // Still 1, not called again
    });
  });
});
