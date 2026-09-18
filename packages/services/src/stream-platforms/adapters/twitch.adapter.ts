import type {
  StreamPlatform,
  StreamPlatformAdapter,
  StreamerInfo,
  LiveStreamInfo,
} from '../types.js';

export interface TwitchAdapterOptions {
  clientId?: string | undefined;
  clientSecret?: string | undefined;
  fetchFn?: typeof fetch | undefined;
}

export class TwitchStreamAdapter implements StreamPlatformAdapter {
  readonly platform: StreamPlatform = 'TWITCH';
  readonly name = 'Twitch Helix';

  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  private readonly fetch: typeof fetch;

  private accessToken: string | null = null;
  private tokenExpiresAt = 0;

  constructor(options: TwitchAdapterOptions = {}) {
    this.clientId = options.clientId ?? process.env.TWITCH_CLIENT_ID;
    this.clientSecret = options.clientSecret ?? process.env.TWITCH_CLIENT_SECRET;
    this.fetch = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  private async getAccessToken(): Promise<string | null> {
    if (!this.isConfigured()) return null;

    const now = Date.now();
    if (this.accessToken && this.tokenExpiresAt > now + 60_000) {
      return this.accessToken;
    }

    try {
      const tokenUrl = new URL('https://id.twitch.tv/oauth2/token');
      tokenUrl.searchParams.set('client_id', this.clientId!);
      tokenUrl.searchParams.set('client_secret', this.clientSecret!);
      tokenUrl.searchParams.set('grant_type', 'client_credentials');

      const response = await this.fetch(tokenUrl.toString(), {
        method: 'POST',
      });

      if (!response.ok) {
        console.warn(`[TwitchAdapter] Token request failed with HTTP ${response.status}`);
        return null;
      }

      const data = (await response.json()) as {
        access_token: string;
        expires_in: number;
        token_type: string;
      };

      this.accessToken = data.access_token;
      this.tokenExpiresAt = now + data.expires_in * 1000;
      return this.accessToken;
    } catch (err) {
      console.error('[TwitchAdapter] Error acquiring OAuth token:', err);
      return null;
    }
  }

  async resolveStreamer(usernameOrId: string): Promise<StreamerInfo | null> {
    const token = await this.getAccessToken();
    if (!token) return null;

    try {
      const sanitized = usernameOrId.toLowerCase().trim().replace(/^https?:\/\/(www\.)?twitch\.tv\//, '');
      const url = new URL('https://api.twitch.tv/helix/users');
      url.searchParams.set('login', sanitized);

      const response = await this.fetch(url.toString(), {
        headers: {
          'Client-ID': this.clientId!,
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as {
        data: Array<{
          id: string;
          login: string;
          display_name: string;
          profile_image_url: string;
        }>;
      };

      const user = data.data?.[0];
      if (!user) return null;

      return {
        platform: 'TWITCH',
        platformUserId: user.id,
        username: user.login,
        displayName: user.display_name,
        avatarUrl: user.profile_image_url || null,
      };
    } catch (err) {
      console.error(`[TwitchAdapter] Failed to resolve streamer '${usernameOrId}':`, err);
      return null;
    }
  }

  async getBatchStreamStatus(
    streamers: Array<{ platformUserId: string; username: string }>,
  ): Promise<Map<string, LiveStreamInfo | null>> {
    const resultMap = new Map<string, LiveStreamInfo | null>();
    if (streamers.length === 0) return resultMap;

    for (const s of streamers) {
      resultMap.set(s.username.toLowerCase(), null);
    }

    const token = await this.getAccessToken();
    if (!token) return resultMap;

    try {
      // Helix streams endpoint allows up to 100 logins per query
      const url = new URL('https://api.twitch.tv/helix/streams');
      for (const s of streamers.slice(0, 100)) {
        url.searchParams.append('user_login', s.username.toLowerCase());
      }

      let response = await this.fetch(url.toString(), {
        headers: {
          'Client-ID': this.clientId!,
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        // Token expired or invalidated, clear and retry once
        this.accessToken = null;
        this.tokenExpiresAt = 0;
        const freshToken = await this.getAccessToken();
        if (freshToken) {
          response = await this.fetch(url.toString(), {
            headers: {
              'Client-ID': this.clientId!,
              Authorization: `Bearer ${freshToken}`,
            },
          });
        }
      }

      if (!response.ok) {
        console.warn(`[TwitchAdapter] Helix streams query failed with HTTP ${response.status}`);
        return resultMap;
      }

      const payload = (await response.json()) as {
        data: Array<{
          id: string;
          user_id: string;
          user_login: string;
          user_name: string;
          game_name: string;
          type: string;
          title: string;
          viewer_count: number;
          started_at: string;
          thumbnail_url: string;
        }>;
      };

      for (const item of payload.data ?? []) {
        if (item.type !== 'live') continue;

        const thumbUrl = item.thumbnail_url
          ? item.thumbnail_url.replace('{width}', '1280').replace('{height}', '720')
          : 'https://static-cdn.jtvnw.net/previews-ttv/live_user_' + item.user_login + '-1280x720.jpg';

        resultMap.set(item.user_login.toLowerCase(), {
          streamId: item.id,
          platform: 'TWITCH',
          streamerUsername: item.user_login,
          streamerDisplayName: item.user_name,
          title: item.title,
          gameName: item.game_name || 'Just Chatting',
          viewerCount: item.viewer_count || 0,
          startedAt: new Date(item.started_at),
          thumbnailUrl: thumbUrl,
          streamUrl: `https://twitch.tv/${item.user_login}`,
        });
      }

      return resultMap;
    } catch (err) {
      console.error('[TwitchAdapter] Error fetching batch stream status:', err);
      return resultMap;
    }
  }

  async getStreamStatus(streamer: {
    platformUserId: string;
    username: string;
  }): Promise<LiveStreamInfo | null> {
    const results = await this.getBatchStreamStatus([streamer]);
    return results.get(streamer.username.toLowerCase()) ?? null;
  }
}
