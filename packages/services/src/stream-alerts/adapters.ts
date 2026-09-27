import { TikTokStreamAdapter } from '../stream-platforms/adapters/tiktok.adapter.js';
import { TwitchStreamAdapter } from '../stream-platforms/adapters/twitch.adapter.js';
import { YouTubeStreamAdapter } from '../stream-platforms/adapters/youtube.adapter.js';
import type { StreamPlatformAdapter } from '../stream-platforms/types.js';

export interface StreamAdapterEnv {
  TWITCH_CLIENT_ID?: string | undefined;
  TWITCH_CLIENT_SECRET?: string | undefined;
  YOUTUBE_API_KEY?: string | undefined;
  TIKTOK_SESSION_ID?: string | undefined;
  TIKTOK_API_KEY?: string | undefined;
}

/** The Twitch, YouTube and TikTok adapters, configured from the environment. */
export function createStreamAdapters(env: StreamAdapterEnv): StreamPlatformAdapter[] {
  return [
    new TwitchStreamAdapter({
      clientId: env.TWITCH_CLIENT_ID,
      clientSecret: env.TWITCH_CLIENT_SECRET,
    }),
    new YouTubeStreamAdapter({ apiKey: env.YOUTUBE_API_KEY }),
    new TikTokStreamAdapter({ sessionId: env.TIKTOK_SESSION_ID, apiKey: env.TIKTOK_API_KEY }),
  ];
}
