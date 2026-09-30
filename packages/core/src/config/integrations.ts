import {
  AI_PROVIDER_LABELS,
  configuredAiProviders,
  AI_PROVIDER_IDS,
  type AiProviderEnv,
} from './ai.js';
import {
  configuredImageProviders,
  IMAGE_PROVIDER_IDS,
  IMAGE_PROVIDER_LABELS,
  type ImageProviderEnv,
} from './images.js';

/** Environment keys the integrations status reads. Only whether each is set is used. */
export interface IntegrationEnv extends AiProviderEnv, ImageProviderEnv {
  DISCORD_TOKEN?: string | undefined;
  TWITCH_CLIENT_ID?: string | undefined;
  TWITCH_CLIENT_SECRET?: string | undefined;
  YOUTUBE_API_KEY?: string | undefined;
  TIKTOK_SESSION_ID?: string | undefined;
  TIKTOK_API_KEY?: string | undefined;
  SPOTIFY_CLIENT_ID?: string | undefined;
  SPOTIFY_CLIENT_SECRET?: string | undefined;
  SPOTIFY_DC?: string | undefined;
  SPOTIFY_KEY?: string | undefined;
  LAVALINK_ENABLED?: string | undefined;
  LAVALINK_HOST?: string | undefined;
  USE_PRIVATE_MUSIC_PACKAGE?: string | undefined;
}

export const INTEGRATION_GROUPS = [
  'Discord',
  'AI chat',
  'Image generation',
  'Stream alerts',
  'Music',
] as const;
export type IntegrationGroup = (typeof INTEGRATION_GROUPS)[number];

/** Whether one integration is set up. Carries no configuration value, so it is safe to show. */
export interface IntegrationStatus {
  id: string;
  group: IntegrationGroup;
  label: string;
  configured: boolean;
  /** What Ririko does without it, for integrations that are optional. */
  note?: string;
}

/**
 * Whether each third-party integration is configured, for the dashboard and `ririko doctor`.
 * Only booleans leave this function; secret values never do.
 */
export function integrationStatus(env: IntegrationEnv): IntegrationStatus[] {
  const ai = configuredAiProviders(env);
  const images = configuredImageProviders(env);
  return [
    {
      id: 'discord',
      group: 'Discord',
      label: 'Discord bot token',
      configured: Boolean(env.DISCORD_TOKEN),
    },
    ...AI_PROVIDER_IDS.map((provider) => ({
      id: `ai.${provider}`,
      group: 'AI chat' as const,
      label: AI_PROVIDER_LABELS[provider],
      configured: ai.includes(provider),
    })),
    ...IMAGE_PROVIDER_IDS.map((provider) => ({
      id: `images.${provider}`,
      group: 'Image generation' as const,
      label: IMAGE_PROVIDER_LABELS[provider],
      configured: images.includes(provider),
    })),
    {
      id: 'streams.twitch',
      group: 'Stream alerts',
      label: 'Twitch',
      configured: Boolean(env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET),
      note: 'Needed for Twitch alerts.',
    },
    {
      id: 'streams.youtube',
      group: 'Stream alerts',
      label: 'YouTube Data API',
      configured: Boolean(env.YOUTUBE_API_KEY),
      note: 'Optional: YouTube alerts use public pages without it.',
    },
    {
      id: 'streams.tiktok',
      group: 'Stream alerts',
      label: 'TikTok session',
      configured: Boolean(env.TIKTOK_SESSION_ID || env.TIKTOK_API_KEY),
      note: 'Optional: TikTok alerts use public pages without it.',
    },
    {
      id: 'music.spotify',
      group: 'Music',
      label: 'Spotify',
      configured: Boolean(
        (env.SPOTIFY_CLIENT_ID && env.SPOTIFY_CLIENT_SECRET) || env.SPOTIFY_DC || env.SPOTIFY_KEY,
      ),
      note: 'Needed to play Spotify links.',
    },
    {
      id: 'music.lavalink',
      group: 'Music',
      label: 'Lavalink server',
      configured: env.LAVALINK_ENABLED !== 'false' && Boolean(env.LAVALINK_HOST),
      note: 'Optional: Ririko uses its built-in player without it.',
    },
    {
      id: 'music.private',
      group: 'Music',
      label: 'Private music package',
      configured: env.USE_PRIVATE_MUSIC_PACKAGE === 'true',
      note: 'Optional: extra sources for the built-in player when Lavalink is unavailable.',
    },
  ];
}
