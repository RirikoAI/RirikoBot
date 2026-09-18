import type {
  StreamPlatform,
  StreamPlatformAdapter,
  StreamerInfo,
  LiveStreamInfo,
} from '../types.js';

export interface YouTubeAdapterOptions {
  apiKey?: string | undefined;
  fetchFn?: typeof fetch | undefined;
}

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const CONSENT_COOKIE =
  'SOCS=CAESEwgDEgk2MTc3OTAwNzQaAmVuIAEaBgiA_LyaBg; CONSENT=YES+cb.20210720-07-p0.en+FX+410';

export class YouTubeStreamAdapter implements StreamPlatformAdapter {
  readonly platform: StreamPlatform = 'YOUTUBE';
  readonly name = 'YouTube Live';

  private readonly apiKey: string | undefined;
  private readonly fetch: typeof fetch;

  constructor(options: YouTubeAdapterOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.YOUTUBE_API_KEY;
    this.fetch = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  isConfigured(): boolean {
    return true; // Works with YouTube Data API v3 key or resilient RSS/web fallback
  }

  hasApiKey(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  async resolveStreamer(input: string): Promise<StreamerInfo | null> {
    const sanitized = input
      .trim()
      .replace(/^https?:\/\/(www\.)?youtube\.com\//i, '')
      .replace(/^https?:\/\/youtu\.be\//i, '');

    // 1. Try YouTube Data API v3 if API key is provided
    if (this.hasApiKey()) {
      const resolved = await this.resolveViaApi(sanitized).catch(() => null);
      if (resolved) return resolved;
    }

    // 2. Fallback to web metadata / RSS parsing
    return this.resolveViaWebFallback(sanitized);
  }

  private async resolveViaApi(input: string): Promise<StreamerInfo | null> {
    const isChannelId = input.startsWith('channel/UC') || input.startsWith('UC');
    const channelId = isChannelId ? input.replace(/^channel\//, '') : null;
    const rawHandle = input.replace(/^channel\//, '').replace(/^@/, '');
    const formattedHandle = `@${rawHandle}`;

    try {
      let url: URL;
      if (channelId) {
        url = new URL('https://www.googleapis.com/youtube/v3/channels');
        url.searchParams.set('part', 'snippet');
        url.searchParams.set('id', channelId);
        url.searchParams.set('key', this.apiKey!);
      } else {
        url = new URL('https://www.googleapis.com/youtube/v3/channels');
        url.searchParams.set('part', 'snippet');
        url.searchParams.set('forHandle', formattedHandle);
        url.searchParams.set('key', this.apiKey!);
      }

      let response = await this.fetch(url.toString());
      if (!response.ok && !channelId) {
        // Fallback search with forUsername if forHandle was not found
        const fallbackUrl = new URL('https://www.googleapis.com/youtube/v3/channels');
        fallbackUrl.searchParams.set('part', 'snippet');
        fallbackUrl.searchParams.set('forUsername', rawHandle);
        fallbackUrl.searchParams.set('key', this.apiKey!);
        response = await this.fetch(fallbackUrl.toString());
      }

      if (!response.ok) return null;

      const payload = (await response.json()) as {
        items?: Array<{
          id: string;
          snippet: {
            title: string;
            customUrl?: string;
            thumbnails?: {
              high?: { url: string };
              medium?: { url: string };
              default?: { url: string };
            };
          };
        }>;
      };

      const item = payload.items?.[0];
      if (!item) return null;

      const customHandle = item.snippet.customUrl?.replace(/^@/, '') || rawHandle;
      const avatar =
        item.snippet.thumbnails?.high?.url ||
        item.snippet.thumbnails?.medium?.url ||
        item.snippet.thumbnails?.default?.url ||
        null;

      return {
        platform: 'YOUTUBE',
        platformUserId: item.id,
        username: customHandle.toLowerCase(),
        displayName: item.snippet.title || customHandle,
        avatarUrl: avatar,
      };
    } catch (err) {
      console.error(`[YouTubeAdapter] Error resolving streamer via API for '${input}':`, err);
      return null;
    }
  }

  private async resolveViaWebFallback(input: string): Promise<StreamerInfo | null> {
    try {
      const isChannelId = input.startsWith('channel/UC') || input.startsWith('UC');
      let targetUrl: string;
      const fallbackUsername = input.replace(/^channel\//, '').replace(/^@/, '');

      if (isChannelId) {
        const channelId = input.replace(/^channel\//, '');
        targetUrl = `https://www.youtube.com/channel/${channelId}`;
      } else {
        const handle = input.startsWith('@') ? input : `@${input}`;
        targetUrl = `https://www.youtube.com/${handle}`;
      }

      const response = await this.fetch(targetUrl, {
        headers: {
          'User-Agent': BROWSER_USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          Cookie: CONSENT_COOKIE,
        },
      });

      if (!response.ok) return null;
      const html = await response.text();

      const channelIdMatch =
        html.match(/<meta itemprop="channelId" content="([^"]+)">/) ||
        html.match(/"channelId":"(UC[^"]+)"/) ||
        html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[^"]+)">/);

      const titleMatch =
        html.match(/<meta property="og:title" content="([^"]+)">/) ||
        html.match(/<title>([^<]+)<\/title>/);

      const imageMatch = html.match(/<meta property="og:image" content="([^"]+)">/);

      if (!channelIdMatch || !channelIdMatch[1]) {
        // If direct channel ID was provided, accept it even if meta tag missing
        if (isChannelId) {
          const cid = input.replace(/^channel\//, '');
          return {
            platform: 'YOUTUBE',
            platformUserId: cid,
            username: fallbackUsername.toLowerCase(),
            displayName: titleMatch?.[1]?.replace(/\s*-\s*YouTube$/, '') || fallbackUsername,
            avatarUrl: imageMatch?.[1] ?? null,
          };
        }
        return null;
      }

      const channelId = channelIdMatch[1];
      const displayName =
        titleMatch?.[1]?.replace(/\s*-\s*YouTube$/, '').trim() || fallbackUsername;

      return {
        platform: 'YOUTUBE',
        platformUserId: channelId,
        username: fallbackUsername.toLowerCase(),
        displayName,
        avatarUrl: imageMatch?.[1] ?? null,
      };
    } catch (err) {
      console.error(`[YouTubeAdapter] Web fallback resolution error for '${input}':`, err);
      return null;
    }
  }

  async getStreamStatus(streamer: {
    platformUserId: string;
    username: string;
  }): Promise<LiveStreamInfo | null> {
    // 1. If API key is available, query YouTube Data API v3
    if (this.hasApiKey()) {
      const liveData = await this.getStreamStatusViaApi(streamer).catch(() => null);
      if (liveData) return liveData;
    }

    // 2. Fallback to web scraping & RSS inspection
    return this.getStreamStatusViaWebFallback(streamer);
  }

  private async getStreamStatusViaApi(streamer: {
    platformUserId: string;
    username: string;
  }): Promise<LiveStreamInfo | null> {
    try {
      const isChannelId = streamer.platformUserId.startsWith('UC');
      if (!isChannelId) return null;

      const url = new URL('https://www.googleapis.com/youtube/v3/search');
      url.searchParams.set('part', 'snippet');
      url.searchParams.set('channelId', streamer.platformUserId);
      url.searchParams.set('eventType', 'live');
      url.searchParams.set('type', 'video');
      url.searchParams.set('key', this.apiKey!);

      const response = await this.fetch(url.toString());
      if (!response.ok) return null;

      const payload = (await response.json()) as {
        items?: Array<{
          id: { videoId: string };
          snippet: {
            title: string;
            channelTitle: string;
            publishedAt: string;
            thumbnails?: {
              high?: { url: string };
              medium?: { url: string };
              default?: { url: string };
            };
          };
        }>;
      };

      const item = payload.items?.[0];
      if (!item || !item.id?.videoId) return null;

      const videoId = item.id.videoId;
      const thumb =
        item.snippet.thumbnails?.high?.url ||
        item.snippet.thumbnails?.medium?.url ||
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

      return {
        streamId: videoId,
        platform: 'YOUTUBE',
        streamerUsername: streamer.username,
        streamerDisplayName: item.snippet.channelTitle || streamer.username,
        title: item.snippet.title || `${streamer.username} is Live on YouTube`,
        gameName: 'YouTube Live',
        viewerCount: 0,
        startedAt: new Date(item.snippet.publishedAt || Date.now()),
        thumbnailUrl: thumb,
        streamUrl: `https://www.youtube.com/watch?v=${videoId}`,
      };
    } catch (err) {
      console.error(`[YouTubeAdapter] Error checking API stream status for '${streamer.username}':`, err);
      return null;
    }
  }

  private async getStreamStatusViaWebFallback(streamer: {
    platformUserId: string;
    username: string;
  }): Promise<LiveStreamInfo | null> {
    try {
      const isChannelId = streamer.platformUserId.startsWith('UC');
      const liveUrl = isChannelId
        ? `https://www.youtube.com/channel/${streamer.platformUserId}/live`
        : `https://www.youtube.com/@${streamer.username}/live`;

      const response = await this.fetch(liveUrl, {
        headers: {
          'User-Agent': BROWSER_USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          Cookie: CONSENT_COOKIE,
        },
      });

      if (!response.ok) return null;

      const html = await response.text();

      // Check if page represents an active live stream
      const isLive =
        html.includes('"isLive":true') ||
        html.includes('"isLiveBroadcast":true') ||
        html.includes('{"text":" LIVE"}') ||
        html.includes('"status":"LIVE"') ||
        html.includes('"style":"LIVE"');

      if (!isLive) return null;

      // Extract video ID, title, and thumbnail
      const videoIdMatch =
        html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([^"&?]+)">/) ||
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
      console.error(`[YouTubeAdapter] Error checking web stream status for '${streamer.username}':`, err);
      return null;
    }
  }
}
