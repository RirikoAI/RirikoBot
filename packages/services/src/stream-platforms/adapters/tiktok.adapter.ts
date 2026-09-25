import type {
  StreamPlatform,
  StreamPlatformAdapter,
  StreamerInfo,
  LiveStreamInfo,
} from '../types.js';

export interface TikTokAdapterOptions {
  sessionId?: string | undefined;
  apiKey?: string | undefined;
  fetchFn?: typeof fetch | undefined;
}

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export class TikTokStreamAdapter implements StreamPlatformAdapter {
  readonly platform: StreamPlatform = 'TIKTOK';
  readonly name = 'TikTok Live';

  private readonly sessionId: string | undefined;
  private readonly apiKey: string | undefined;
  private readonly fetch: typeof fetch;

  constructor(options: TikTokAdapterOptions = {}) {
    this.sessionId = options.sessionId ?? process.env.TIKTOK_SESSION_ID;
    this.apiKey = options.apiKey ?? process.env.TIKTOK_API_KEY;
    this.fetch = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  isConfigured(): boolean {
    return true; // Works with session/API key or public Webcast alive checks
  }

  private getRequestHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'User-Agent': BROWSER_USER_AGENT,
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Ch-Ua': '"Chromium";v="126", "Google Chrome";v="126", "Not=A?Brand";v="99"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
    };

    if (this.sessionId) {
      headers.Cookie = `sessionid=${this.sessionId}; sessionid_ss=${this.sessionId};`;
    }

    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }

    return headers;
  }

  async resolveStreamer(input: string): Promise<StreamerInfo | null> {
    try {
      const sanitized = input
        .trim()
        .replace(/^https?:\/\/(www\.)?tiktok\.com\//i, '')
        .replace(/^@/, '')
        .replace(/\/.*$/, '')
        .trim();

      if (!sanitized) return null;

      const profileUrl = `https://www.tiktok.com/@${sanitized}`;
      const response = await this.fetch(profileUrl, {
        headers: this.getRequestHeaders(),
      });

      if (!response.ok) return null;
      const html = await response.text();

      // 1. Try parsing JSON rehydration script
      const scriptMatch = html.match(
        /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/,
      );
      if (scriptMatch && scriptMatch[1]) {
        try {
          const parsed = JSON.parse(scriptMatch[1]) as Record<string, any>;
          const defaultScope = parsed['__DEFAULT_SCOPE__'] || {};
          const userDetail = defaultScope['webapp.user-detail']?.userInfo?.user;

          if (userDetail) {
            return {
              platform: 'TIKTOK',
              platformUserId: userDetail.id || sanitized.toLowerCase(),
              username: userDetail.uniqueId || sanitized,
              displayName: userDetail.nickname || sanitized,
              avatarUrl: userDetail.avatarLarger || userDetail.avatarThumb || null,
            };
          }
        } catch {
          // Ignore JSON parse errors and fall through to meta tags
        }
      }

      // 2. Fallback to OpenGraph meta tags
      const titleMatch = html.match(/<meta property="og:title" content="([^"]+)">/);
      const imageMatch = html.match(/<meta property="og:image" content="([^"]+)">/);
      const rawTitle = titleMatch?.[1]
        ? titleMatch[1].replace(/\s*\(.*?\)\s*\|.*$/, '').trim()
        : sanitized;
      const displayName = rawTitle || sanitized;

      return {
        platform: 'TIKTOK',
        platformUserId: sanitized.toLowerCase(),
        username: sanitized,
        displayName,
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
      const cleanUsername = streamer.username.replace(/^@/, '');
      const liveUrl = `https://www.tiktok.com/@${cleanUsername}/live`;

      const response = await this.fetch(liveUrl, {
        headers: this.getRequestHeaders(),
      });

      if (!response.ok) return null;

      const html = await response.text();

      // 1. Check Next.js rehydration JSON payload
      const scriptMatch = html.match(
        /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/,
      );
      if (scriptMatch && scriptMatch[1]) {
        try {
          const parsed = JSON.parse(scriptMatch[1]) as Record<string, any>;
          const liveDetail = parsed['__DEFAULT_SCOPE__']?.['webapp.live-detail'];
          const liveRoom = liveDetail?.liveRoom;

          if (liveRoom && (liveRoom.status === 2 || liveRoom.liveRoomMode === 1)) {
            const roomId = String(liveRoom.roomId || liveRoom.id || Date.now());
            const title = liveRoom.title || `${cleanUsername} is Live on TikTok!`;
            const coverUrl =
              liveRoom.cover?.url_list?.[0] ||
              'https://sf16-scmcdn-va.ibytedtos.com/goofy/tiktok/web/node/_next/static/images/logo-732fc701cdd3e0c97ca825d6156937b0.svg';
            const viewerCount = Number(liveRoom.user_count || liveRoom.stats?.userCount || 0);

            return {
              streamId: roomId,
              platform: 'TIKTOK',
              streamerUsername: cleanUsername,
              streamerDisplayName: cleanUsername,
              title,
              gameName: 'TikTok Live',
              viewerCount,
              startedAt: new Date(liveRoom.createTime ? liveRoom.createTime * 1000 : Date.now()),
              thumbnailUrl: coverUrl,
              streamUrl: liveUrl,
            };
          }
        } catch {
          // Fall through to regex markers
        }
      }

      // 2. Check for live room presence in raw HTML markers
      const isLive =
        html.includes('"status":2') ||
        html.includes('"liveRoom"') ||
        html.includes('"isLive":true') ||
        html.includes('LIVE_ROOM');

      if (!isLive) return null;

      // Extract room ID if present
      const roomIdMatch = html.match(/"roomId":"(\d+)"/) || html.match(/"room_id":(\d+)/);
      const streamId = roomIdMatch?.[1] ?? `tiktok-${cleanUsername}-${Date.now()}`;

      // 3. If room ID is available, verify with lightweight Webcast alive check
      if (roomIdMatch?.[1]) {
        try {
          const aliveUrl = `https://webcast.tiktok.com/webcast/room/check_alive/?aid=1988&room_ids=${roomIdMatch[1]}`;
          const aliveRes = await this.fetch(aliveUrl, { headers: this.getRequestHeaders() });
          if (aliveRes.ok) {
            const aliveJson = (await aliveRes.json()) as { data?: Array<{ alive: boolean }> };
            if (aliveJson.data && aliveJson.data.length > 0 && !aliveJson.data[0]?.alive) {
              return null; // Confirmed finished
            }
          }
        } catch {
          // If alive check fails, rely on HTML marker
        }
      }

      const titleMatch = html.match(/<meta property="og:title" content="([^"]+)">/);
      const title = titleMatch?.[1] ?? `${cleanUsername} is Live on TikTok!`;

      const imageMatch = html.match(/<meta property="og:image" content="([^"]+)">/);
      const thumbnailUrl =
        imageMatch?.[1] ??
        'https://sf16-scmcdn-va.ibytedtos.com/goofy/tiktok/web/node/_next/static/images/logo-732fc701cdd3e0c97ca825d6156937b0.svg';

      return {
        streamId,
        platform: 'TIKTOK',
        streamerUsername: cleanUsername,
        streamerDisplayName: cleanUsername,
        title,
        gameName: 'TikTok Live',
        viewerCount: 0,
        startedAt: new Date(),
        thumbnailUrl,
        streamUrl: liveUrl,
      };
    } catch (err) {
      console.error(
        `[TikTokAdapter] Error checking stream status for '${streamer.username}':`,
        err,
      );
      return null;
    }
  }
}
