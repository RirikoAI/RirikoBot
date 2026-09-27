import type { StreamPlatform } from '../stream-platforms/types.js';

export const STREAM_PLATFORMS: readonly StreamPlatform[] = ['TWITCH', 'YOUTUBE', 'TIKTOK'];

export const STREAM_PLATFORM_LABELS: Record<StreamPlatform, string> = {
  TWITCH: 'Twitch',
  YOUTUBE: 'YouTube',
  TIKTOK: 'TikTok',
};

/** A YouTube channel ID: `UC` plus 22 URL-safe base64 characters. Case sensitive. */
const YOUTUBE_CHANNEL_ID = /^UC[\w-]{22}$/;

/** The platform named by `value` (any case), or null for anything else. */
export function parseStreamPlatform(value: string | null | undefined): StreamPlatform | null {
  const upper = value?.trim().toUpperCase();
  return STREAM_PLATFORMS.find((platform) => platform === upper) ?? null;
}

/**
 * The platform for a streamer given as a name, handle, channel ID or profile link. An explicit
 * platform wins; otherwise the link or a YouTube channel ID decides, and a bare name is Twitch.
 */
export function inferPlatform(input: string, explicitPlatform?: string | null): StreamPlatform {
  const explicit = parseStreamPlatform(explicitPlatform);
  if (explicit) return explicit;

  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();
  if (
    lower.includes('youtube.com') ||
    lower.includes('youtu.be') ||
    YOUTUBE_CHANNEL_ID.test(trimmed)
  ) {
    return 'YOUTUBE';
  }
  if (lower.includes('tiktok.com')) return 'TIKTOK';
  return 'TWITCH';
}

/** The name, handle or channel ID in `input`, without the profile link around it or a leading @. */
export function cleanStreamerIdentifier(input: string): string {
  let clean = input.trim();
  clean = clean.replace(/^https?:\/\/(www\.|m\.)?twitch\.tv\//i, '');
  clean = clean.replace(/^https?:\/\/(www\.|m\.)?tiktok\.com\/@/i, '');
  clean = clean.replace(/^https?:\/\/(www\.|m\.)?tiktok\.com\//i, '');
  clean = clean.replace(/^https?:\/\/(www\.|m\.)?youtube\.com\/(@|channel\/|c\/)?/i, '');
  clean = clean.replace(/^https?:\/\/youtu\.be\//i, '');
  clean = clean.replace(/^@/, '');
  clean = clean.split('/')[0]!;
  clean = clean.split('?')[0]!;
  return clean.trim();
}

/**
 * The platform user ID stored when the platform cannot resolve the streamer. Handles are case
 * insensitive, so they are lowercased; YouTube channel IDs are case sensitive and kept.
 */
export function fallbackPlatformUserId(identifier: string): string {
  return YOUTUBE_CHANNEL_ID.test(identifier) ? identifier : identifier.toLowerCase();
}
