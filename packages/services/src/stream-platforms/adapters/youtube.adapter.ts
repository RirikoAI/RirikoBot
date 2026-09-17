import type {
  StreamPlatform,
  StreamPlatformAdapter,
  StreamerInfo,
  LiveStreamInfo,
} from '../types.js';

export interface YouTubeAdapterOptions {
  fetchFn?: typeof fetch | undefined;
}

export class YouTubeStreamAdapter implements StreamPlatformAdapter {
  readonly platform: StreamPlatform = 'YOUTUBE';
  readonly name = 'YouTube Live';

  private readonly fetch: typeof fetch;

  constructor(options: YouTubeAdapterOptions = {}) {
    this.fetch = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  isConfigured(): boolean {
    return true; // Uses public RSS and live endpoints, zero credentials required
  }

  async resolveStreamer(input: string): Promise<StreamerInfo | null> {
    try {
      const sanitized = input.trim().replace(/^https?:\/\/(www\.)?youtube\.com\//, '');

      // Check if input is a direct channel ID (UC...)
      if (sanitized.startsWith('channel/UC') || sanitized.startsWith('UC')) {
        const channelId = sanitized.replace(/^channel\//, '');
        const channelUrl = `https://www.youtube.com/channel/${channelId}`;
        const response = await this.fetch(channelUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RirikoBot/2.0)' },
        });

        if (!response.ok) return null;
        const html = await response.text();

        const titleMatch = html.match(/<meta property="og:title" content="([^"]+)">/);
        const imageMatch = html.match(/<meta property="og:image" content="([^"]+)">/);
        const name = titleMatch?.[1] ?? channelId;

        return {
          platform: 'YOUTUBE',
          platformUserId: channelId,
          username: name.toLowerCase().replace(/\s+/g, '_'),
          displayName: name,
          avatarUrl: imageMatch?.[1] ?? null,
        };
      }

      // Handle @handle or /c/ format
      const handle = sanitized.startsWith('@') ? sanitized : `@${sanitized}`;
      const response = await this.fetch(`https://www.youtube.com/${handle}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RirikoBot/2.0)' },
      });

      if (!response.ok) return null;
      const html = await response.text();

      const channelIdMatch = html.match(/<meta itemprop="channelId" content="([^"]+)">/) ||
        html.match(/"channelId":"(UC[^"]+)"/);
      const titleMatch = html.match(/<meta property="og:title" content="([^"]+)">/);
      const imageMatch = html.match(/<meta property="og:image" content="([^"]+)">/);

      if (!channelIdMatch || !channelIdMatch[1]) return null;

      const channelId = channelIdMatch[1];
      const displayName = titleMatch?.[1] ?? handle;

      return {
        platform: 'YOUTUBE',
        platformUserId: channelId,
        username: handle.replace(/^@/, ''),
        displayName,
        avatarUrl: imageMatch?.[1] ?? null,
      };
    } catch (err) {
      console.error(`[YouTubeAdapter] Failed to resolve streamer '${input}':`, err);
      return null;
    }
  }

  async getStreamStatus(streamer: {
    platformUserId: string;
    username: string;
  }): Promise<LiveStreamInfo | null> {
    try {
      const liveUrl = `https://www.youtube.com/channel/${streamer.platformUserId}/live`;
      const response = await this.fetch(liveUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RirikoBot/2.0)' },
      });

      if (!response.ok) return null;

      const html = await response.text();

      // Check if page represents an active live stream
      const isLive =
        html.includes('"isLive":true') ||
        html.includes('"isLiveBroadcast":true') ||
        html.includes('{"text":" LIVE"}') ||
        html.includes('"status":"LIVE"');

      if (!isLive) return null;

      // Extract video ID, title, and thumbnail
      const videoIdMatch =
        html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([^"]+)">/) ||
        html.match(/"videoId":"([^"]{11})"/);

      if (!videoIdMatch || !videoIdMatch[1]) return null;
      const videoId = videoIdMatch[1];

      const titleMatch =
        html.match(/<meta property="og:title" content="([^"]+)">/) ||
        html.match(/"title":"([^"]+)"/);
      const title = titleMatch?.[1] ?? `${streamer.username} is Live on YouTube`;

      return {
        streamId: videoId,
        platform: 'YOUTUBE',
        streamerUsername: streamer.username,
        streamerDisplayName: streamer.username,
        title,
        gameName: 'YouTube Live',
        viewerCount: 0,
        startedAt: new Date(),
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        streamUrl: `https://www.youtube.com/watch?v=${videoId}`,
      };
    } catch (err) {
      console.error(`[YouTubeAdapter] Error checking stream status for '${streamer.username}':`, err);
      return null;
    }
  }
}
