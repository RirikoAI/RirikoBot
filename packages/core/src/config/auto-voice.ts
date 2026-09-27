import { z } from 'zod';

export const MAX_AUTO_VOICE_HUBS = 20;
export const DEFAULT_AUTO_VOICE_TEMPLATE = "{user}'s Room";
export const DEFAULT_AUTO_VOICE_BITRATE = 64_000;
export const MIN_VOICE_BITRATE = 8_000;
export const MAX_VOICE_BITRATE = 384_000;

/**
 * Highest voice bitrate Discord allows in a guild: 96 kbps, raised by the boost tier to 128,
 * 256 or 384 kbps. Guilds with the `VIP_REGIONS` feature always get 384 kbps.
 */
export function voiceBitrateCap(premiumTier: number, vipRegions = false): number {
  if (vipRegions) return MAX_VOICE_BITRATE;
  return [96_000, 128_000, 256_000][premiumTier] ?? MAX_VOICE_BITRATE;
}

/** A "join to create" hub: joining `channelId` gives the member a temporary voice channel. */
export interface AutoVoiceHub {
  channelId: string;
  /** Name of the created channel; `{user}` becomes the member's display name. */
  nameTemplate: string;
  /** Member limit of the created channel; `0` means no limit. */
  userLimit: number;
  /** Bitrate in bits per second, lowered by the bot to the guild's boost tier cap. */
  bitrate: number;
}

const SNOWFLAKE = /^\d{17,20}$/;

function wholeNumber(min: number, max: number, message: string) {
  return z
    .number({ invalid_type_error: message, required_error: message })
    .int(message)
    .min(min, message)
    .max(max, message);
}

export const AutoVoiceHubSchema = z
  .object({
    channelId: z
      .string({
        required_error: 'Choose a voice channel.',
        invalid_type_error: 'Choose a voice channel.',
      })
      .regex(SNOWFLAKE, 'Choose a voice channel.'),
    nameTemplate: z
      .string({ invalid_type_error: 'Enter a channel name.' })
      .trim()
      .min(1, 'Enter a channel name.')
      .max(100, 'Channel names can be at most 100 characters.')
      .default(DEFAULT_AUTO_VOICE_TEMPLATE),
    userLimit: wholeNumber(0, 99, 'User limit must be a whole number from 0 to 99.').default(0),
    bitrate: wholeNumber(
      MIN_VOICE_BITRATE,
      MAX_VOICE_BITRATE,
      `Bitrate must be from ${MIN_VOICE_BITRATE / 1000} to ${MAX_VOICE_BITRATE / 1000} kbps.`,
    ).default(DEFAULT_AUTO_VOICE_BITRATE),
  })
  .strict();

/** A guild's hubs, one per voice channel, sorted by channel so equal lists compare equal. */
export const AutoVoiceHubsSchema = z
  .array(AutoVoiceHubSchema, { invalid_type_error: 'Enter the hubs as a list.' })
  .max(MAX_AUTO_VOICE_HUBS, `A server can have at most ${MAX_AUTO_VOICE_HUBS} hubs.`)
  .superRefine((hubs, ctx) => {
    const seen = new Set<string>();
    hubs.forEach((hub, index) => {
      if (seen.has(hub.channelId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'channelId'],
          message: 'This channel is already a hub.',
        });
      }
      seen.add(hub.channelId);
    });
  })
  .transform((hubs): AutoVoiceHub[] =>
    [...hubs].sort((a, b) =>
      a.channelId === b.channelId ? 0 : a.channelId < b.channelId ? -1 : 1,
    ),
  );
