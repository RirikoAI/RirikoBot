/**
 * Image generation options shared by the bot, the dashboard and `ririko guild:config`.
 * `@ririko/services` builds its providers and style presets under these IDs.
 */

/** Providers a guild may choose. The mock provider is only a fallback and is never offered. */
export const IMAGE_PROVIDER_IDS = ['gemini', 'replicate', 'comfyui'] as const;
export type ImageProviderId = (typeof IMAGE_PROVIDER_IDS)[number];

export const IMAGE_PROVIDER_LABELS: Record<ImageProviderId, string> = {
  gemini: 'Google Gemini',
  replicate: 'Replicate (Flux)',
  comfyui: 'ComfyUI / Stable Diffusion WebUI',
};

export const IMAGE_STYLE_PRESETS = [
  { id: 'anime', label: 'Anime Illustration' },
  { id: 'photoreal', label: 'Photorealistic' },
  { id: 'pixel-art', label: 'Pixel Art' },
  { id: 'fantasy', label: 'Epic Fantasy' },
  { id: 'cyberpunk', label: 'Cyberpunk & Sci-Fi' },
  { id: 'none', label: 'Raw Prompt' },
] as const;
export type ImageStylePresetId = (typeof IMAGE_STYLE_PRESETS)[number]['id'];
export const IMAGE_STYLE_PRESET_IDS = IMAGE_STYLE_PRESETS.map((preset) => preset.id) as [
  ImageStylePresetId,
  ...ImageStylePresetId[],
];

/** Images a member may generate in 24 hours when `IMAGE_DAILY_QUOTA` is not set. */
export const DEFAULT_IMAGE_DAILY_QUOTA = 30;
/** Highest per-member daily limit a guild may set. */
export const MAX_IMAGE_MEMBER_DAILY_LIMIT = 500;

/**
 * Images a member may generate in 24 hours in a guild: the guild's limit, but never more than
 * the bot's own quota. `0` means no limit.
 */
export function imageDailyLimit(botQuota: number, guildLimit: number | null | undefined): number {
  if (guildLimit === null || guildLimit === undefined) return botQuota;
  return botQuota > 0 ? Math.min(botQuota, guildLimit) : guildLimit;
}

/** Credentials that make each image provider usable, from the shared environment config. */
export interface ImageProviderEnv {
  GEMINI_API_KEY?: string | undefined;
  REPLICATE_API_TOKEN?: string | undefined;
  COMFYUI_URL?: string | undefined;
  /** Written by older `ririko image-configure` versions; read like `COMFYUI_URL`. */
  COMFYUI_BASE_URL?: string | undefined;
  SD_WEBUI_URL?: string | undefined;
}

/**
 * Image providers with credentials (or, for ComfyUI, an explicit server address). Only these
 * are offered on the dashboard.
 */
export function configuredImageProviders(env: ImageProviderEnv): ImageProviderId[] {
  const configured: Record<ImageProviderId, boolean> = {
    gemini: Boolean(env.GEMINI_API_KEY),
    replicate: Boolean(env.REPLICATE_API_TOKEN),
    comfyui: Boolean(env.COMFYUI_URL || env.COMFYUI_BASE_URL || env.SD_WEBUI_URL),
  };
  return IMAGE_PROVIDER_IDS.filter((provider) => configured[provider]);
}
