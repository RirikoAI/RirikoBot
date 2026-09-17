import type {
  StreamPlatform,
  StreamPlatformAdapter,
  StreamerInfo,
  LiveStreamInfo,
} from '../types.js';

export interface TikTokAdapterOptions {
  fetchFn?: typeof fetch | undefined;
}

export class TikTokStreamAdapter implements StreamPlatformAdapter {
  readonly platform: StreamPlatform = 'TIKTOK';
  readonly name = 'TikTok Live';

  private readonly fetch: typeof fetch;

  constructor(options: TikTokAdapterOptions = {}) {
    this.fetch = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  isConfigured(): boolean {
    return true; // Uses public web live room status
  }

  async resolveStreamer(input: string): Promise<StreamerInfo | null> {
    try {
      const sanitized = input
        .trim()
        .replace(/^https?:\/\/(www\.)?tiktok\.com\//, '')
        .replace(/^\/@?/, '')
        .replace(/\/.*$/, '');

      if (!sanitized) return null;

      const profileUrl = `https://www.tiktok.com/@${sanitized}`;
      const response = await this.fetch(profileUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        },
      });

      if (!response.ok) return null;
      const html = await response.text();

      const titleMatch = html.match(/<meta property="og:title" content="([^"]+)">/);
      const imageMatch = html.match(/<meta property="og:image" content="([^"]+)">/);
      const displayName = titleMatch?.[1] ? titleMatch[1].replace(/\s*\(.*?\)\s*\|.*$/, '').trim() : sanitized;

      return {
        platform: 'TIKTOK',
        platformUserId: sanitized.toLowerCase(),
        username: sanitized,
        displayName: displayName || sanitized,
        avatarUrl: imageMatch?.[1] ?? null,
      };
    } catch (err) {
      console.error(`[TikTokAdapter] Failed to resolve streamer '${input}':`, err);
      return null;
    }
  }

  async getStreamStatus(streamer: {
    platformUserId: string;
    username: string;
  }): Promise<LiveStreamInfo | null> {
    try {
      const liveUrl = `https://www.tiktok.com/@${streamer.username}/live`;
      const response = await this.fetch(liveUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        },
      });

      if (!response.ok) return null;

      const html = await response.text();

      // Check for live room presence
      const isLive =
        html.includes('"status":2') ||
        html.includes('"liveRoom"') ||
        html.includes('"isLive":true') ||
        html.includes('LIVE_ROOM');

      if (!isLive) return null;

      // Extract room ID if present
      const roomIdMatch = html.match(/"roomId":"(\d+)"/) || html.match(/"room_id":(\d+)/);
      const streamId = roomIdMatch?.[1] ?? `tiktok-${streamer.username}-${Date.now()}`;

      const titleMatch = html.match(/<meta property="og:title" content="([^"]+)">/);
      const title = titleMatch?.[1] ?? `${streamer.username} is Live on TikTok!`;

      const imageMatch = html.match(/<meta property="og:image" content="([^"]+)">/);
      const thumbnailUrl = imageMatch?.[1] ??
        'https://sf16-scmcdn-va.ibytedtos.com/goofy/tiktok/web/node/_next/static/images/logo-732fc701cdd3e0c97ca825d6156937b0.svg';

      return {
        streamId,
        platform: 'TIKTOK',
        streamerUsername: streamer.username,
        streamerDisplayName: streamer.username,
        title,
        gameName: 'TikTok Live',
        viewerCount: 0,
        startedAt: new Date(),
        thumbnailUrl,
        streamUrl: `https://www.tiktok.com/@${streamer.username}/live`,
      };
    } catch (err) {
      console.error(`[TikTokAdapter] Error checking stream status for '${streamer.username}':`, err);
      return null;
    }
  }
}
