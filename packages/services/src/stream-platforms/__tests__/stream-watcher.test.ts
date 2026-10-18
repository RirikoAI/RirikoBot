import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDatabaseClient, StreamRepository } from '@ririko/database';
import type { SqliteDatabaseClient } from '@ririko/database';
import { TwitchStreamAdapter } from '../adapters/twitch.adapter.js';
import { YouTubeStreamAdapter } from '../adapters/youtube.adapter.js';
import { TikTokStreamAdapter } from '../adapters/tiktok.adapter.js';
import { StreamWatcherEngine } from '../engine.js';
import type { LiveStreamInfo } from '../types.js';

describe('Stream Platforms & Watcher Engine (TASK-0801)', () => {
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

  describe('TwitchStreamAdapter', () => {
    it('should report unconfigured if client ID or secret is missing', () => {
      const adapter = new TwitchStreamAdapter({ clientId: undefined, clientSecret: undefined });
      expect(adapter.isConfigured()).toBe(false);
    });

    it('should fetch access token and resolve streamer metadata', async () => {
      const mockFetch = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
        const urlStr = input.toString();
        if (urlStr.includes('/oauth2/token')) {
          return new Response(
            JSON.stringify({
              access_token: 'mock_access_token_123',
              expires_in: 3600,
              token_type: 'bearer',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (urlStr.includes('/helix/users')) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  id: 'twitch_123',
                  login: 'teststreamer',
                  display_name: 'Test Streamer',
                  profile_image_url: 'https://example.com/avatar.jpg',
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(null, { status: 404 });
      });

      const adapter = new TwitchStreamAdapter({
        clientId: 'mock_id',
        clientSecret: 'mock_secret',
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      expect(adapter.isConfigured()).toBe(true);
      const user = await adapter.resolveStreamer('teststreamer');

      expect(user).not.toBeNull();
      expect(user?.platform).toBe('TWITCH');
      expect(user?.platformUserId).toBe('twitch_123');
      expect(user?.displayName).toBe('Test Streamer');
      expect(user?.avatarUrl).toBe('https://example.com/avatar.jpg');
    });

    it('should query live streams in batch and format thumbnail dimensions', async () => {
      const mockFetch = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
        const urlStr = input.toString();
        if (urlStr.includes('/oauth2/token')) {
          return new Response(
            JSON.stringify({ access_token: 'tok_abc', expires_in: 3600, token_type: 'bearer' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        if (urlStr.includes('/helix/streams')) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  id: 'stream_999',
                  user_id: 'twitch_123',
                  user_login: 'teststreamer',
                  user_name: 'Test Streamer',
                  game_name: 'Valorant',
                  type: 'live',
                  title: 'Ranked Grind To Radiant',
                  viewer_count: 1450,
                  started_at: '2026-09-17T12:00:00Z',
                  thumbnail_url:
                    'https://static-cdn.jtvnw.net/previews-ttv/live_user_teststreamer-{width}x{height}.jpg',
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(null, { status: 404 });
      });

      const adapter = new TwitchStreamAdapter({
        clientId: 'mock_id',
        clientSecret: 'mock_secret',
        fetchFn: mockFetch as unknown as typeof fetch,
      });

      const result = await adapter.getBatchStreamStatus([
        { platformUserId: 'twitch_123', username: 'teststreamer' },
        { platformUserId: 'twitch_456', username: 'offlinestreamer' },
      ]);

      const online = result.get('teststreamer');
      expect(online).not.toBeNull();
      expect(online?.streamId).toBe('stream_999');
      expect(online?.gameName).toBe('Valorant');
      expect(online?.viewerCount).toBe(1450);
      expect(online?.thumbnailUrl).toBe(
        'https://static-cdn.jtvnw.net/previews-ttv/live_user_teststreamer-1280x720.jpg',
      );

      const offline = result.get('offlinestreamer');
      expect(offline).toBeNull();
    });
  });

  describe('YouTubeStreamAdapter', () => {
    it('should resolve channel ID and display name from public channel metadata', async () => {
      const mockFetch = vi.fn(async () => {
        const html = `
          <html>
            <head>
              <meta property="og:title" content="Ririko Gaming">
              <meta property="og:image" content="https://yt3.ggpht.com/avatar.jpg">
              <meta itemprop="channelId" content="UC1234567890abcdef">
            </head>
          </html>
        `;
        return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } });
      });

      const adapter = new YouTubeStreamAdapter({ fetchFn: mockFetch as unknown as typeof fetch });
      const streamer = await adapter.resolveStreamer('@ririkogaming');

      expect(streamer).not.toBeNull();
      expect(streamer?.platform).toBe('YOUTUBE');
      expect(streamer?.platformUserId).toBe('UC1234567890abcdef');
      expect(streamer?.displayName).toBe('Ririko Gaming');
      expect(streamer?.avatarUrl).toBe('https://yt3.ggpht.com/avatar.jpg');
    });

    it('should detect live YouTube broadcast and stream metadata', async () => {
      const mockFetch = vi.fn(async () => {
        const html = `
          <html>
            <head>
              <link rel="canonical" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ">
              <meta property="og:title" content="Live 24/7 Anime Lofi Chill Beats">
            </head>
            <body>
              <script>var ytInitialData = {"isLive":true,"status":"LIVE"};</script>
            </body>
          </html>
        `;
        return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } });
      });

      const adapter = new YouTubeStreamAdapter({ fetchFn: mockFetch as unknown as typeof fetch });
      const status = await adapter.getStreamStatus({
        platformUserId: 'UC1234567890abcdef',
        username: 'lofigirl',
      });

      expect(status).not.toBeNull();
      expect(status?.streamId).toBe('dQw4w9WgXcQ');
      expect(status?.streamUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(status?.thumbnailUrl).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
      expect(status?.title).toBe('Live 24/7 Anime Lofi Chill Beats');
    });
  });

  describe('TikTokStreamAdapter', () => {
    it('should resolve TikTok username and live room metadata', async () => {
      const mockFetch = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
        const url = input.toString();
        if (url.includes('/live')) {
          const html = `
            <html>
              <head>
                <meta property="og:title" content="Late Night Jam Session!">
                <meta property="og:image" content="https://example.com/tiktok-live.jpg">
              </head>
              <body>
                <script>window['LIVE_ROOM'] = {"status":2,"roomId":"738920182736152"};</script>
              </body>
            </html>
          `;
          return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } });
        }

        const profileHtml = `
          <html>
            <head>
              <meta property="og:title" content="Musician TikToker (@musician)">
              <meta property="og:image" content="https://example.com/musician.jpg">
            </head>
          </html>
        `;
        return new Response(profileHtml, { status: 200, headers: { 'Content-Type': 'text/html' } });
      });

      const adapter = new TikTokStreamAdapter({ fetchFn: mockFetch as unknown as typeof fetch });
      const streamer = await adapter.resolveStreamer('musician');

      expect(streamer).not.toBeNull();
      expect(streamer?.platform).toBe('TIKTOK');
      expect(streamer?.username).toBe('musician');

      const liveStatus = await adapter.getStreamStatus({
        platformUserId: 'musician',
        username: 'musician',
      });

      expect(liveStatus).not.toBeNull();
      expect(liveStatus?.streamId).toBe('738920182736152');
      expect(liveStatus?.title).toBe('Late Night Jam Session!');
    });
  });

  describe('StreamWatcherEngine Orchestration', () => {
    it('should detect OFFLINE -> LIVE transition, update DB, record event, and fire callback', async () => {
      // 1. Setup streamer with active subscription in DB
      const streamer = await streamRepo.upsertStreamer({
        platform: 'TWITCH',
        platformUserId: 'tw_100',
        username: 'pro_player',
        isLive: false,
      });

      await streamRepo.addSubscription({
        streamerId: streamer.id,
        guildId: 'guild_1',
        channelId: 'channel_1',
      });

      // 2. Setup mock Twitch adapter reporting live
      const mockLiveInfo: LiveStreamInfo = {
        streamId: 'stream_live_100',
        platform: 'TWITCH',
        streamerUsername: 'pro_player',
        title: 'Championship Finals',
        gameName: 'Apex Legends',
        viewerCount: 5000,
        startedAt: new Date('2026-09-17T18:00:00Z'),
        thumbnailUrl: 'https://example.com/thumb.jpg',
        streamUrl: 'https://twitch.tv/pro_player',
      };

      const mockTwitch = {
        platform: 'TWITCH' as const,
        name: 'Mock Twitch',
        isConfigured: () => true,
        resolveStreamer: vi.fn(),
        getStreamStatus: vi.fn(),
        getBatchStreamStatus: vi.fn(async () => new Map([['pro_player', mockLiveInfo]])),
      };

      const onLiveSpy = vi.fn();
      const onOfflineSpy = vi.fn();

      const engine = new StreamWatcherEngine(streamRepo, {
        checkIntervalMs: 60_000,
        onStreamLive: onLiveSpy,
        onStreamOffline: onOfflineSpy,
      });

      engine.registerAdapter(mockTwitch);

      // 3. Trigger check cycle
      const liveCount = await engine.checkStreams();
      expect(liveCount).toBe(1);

      // Verify DB state updated to isLive = true
      const updatedStreamer = await streamRepo.findById(streamer.id);
      expect(updatedStreamer?.isLive).toBe(true);

      // Verify callback triggered
      expect(onLiveSpy).toHaveBeenCalledTimes(1);
      expect(onLiveSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: streamer.id, username: 'pro_player' }),
        expect.objectContaining({ streamId: 'stream_live_100', gameName: 'Apex Legends' }),
      );
      expect(onOfflineSpy).not.toHaveBeenCalled();

      // Verify stream_events record created
      const events = client.raw
        .prepare('SELECT * FROM stream_events WHERE streamer_id = ?')
        .all(streamer.id) as any[];
      expect(events).toHaveLength(1);
      expect(events[0].stream_id).toBe('stream_live_100');
      expect(events[0].game_name).toBe('Apex Legends');
    });

    it('should detect LIVE -> OFFLINE transition and fire onStreamOffline', async () => {
      // 1. Setup streamer already marked live
      const streamer = await streamRepo.upsertStreamer({
        platform: 'TWITCH',
        platformUserId: 'tw_200',
        username: 'night_owl',
        isLive: true,
      });

      await streamRepo.addSubscription({
        streamerId: streamer.id,
        guildId: 'guild_2',
        channelId: 'channel_2',
      });

      // 2. Adapter reports stream ended (null)
      const mockTwitch = {
        platform: 'TWITCH' as const,
        name: 'Mock Twitch',
        isConfigured: () => true,
        resolveStreamer: vi.fn(),
        getStreamStatus: vi.fn(),
        getBatchStreamStatus: vi.fn(async () => new Map([['night_owl', null]])),
      };

      const onLiveSpy = vi.fn();
      const onOfflineSpy = vi.fn();

      const engine = new StreamWatcherEngine(streamRepo, {
        onStreamLive: onLiveSpy,
        onStreamOffline: onOfflineSpy,
      });
      engine.registerAdapter(mockTwitch);

      await engine.checkStreams();

      const updated = await streamRepo.findById(streamer.id);
      expect(updated?.isLive).toBe(false);

      expect(onOfflineSpy).toHaveBeenCalledTimes(1);
      expect(onOfflineSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: streamer.id, username: 'night_owl' }),
      );
      expect(onLiveSpy).not.toHaveBeenCalled();
    });
  });
});
