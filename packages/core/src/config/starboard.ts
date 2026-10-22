import { z } from 'zod';

/** Emoji a server's starboard counts when it has not chosen one. */
export const DEFAULT_STARBOARD_EMOJI = '⭐';
/** Most stars a message may need before it reaches the starboard. */
export const MAX_STARBOARD_THRESHOLD = 100;
/** Most channels a server can exclude from its starboard. */
export const MAX_STARBOARD_IGNORED_CHANNELS = 25;

const EMOJI_MESSAGE =
  'Use one emoji, such as ⭐, or one custom server emoji written as <:name:id> or <a:name:id>.';
const CUSTOM_EMOJI = /^<(a?):(\w{2,32}):(\d{17,20})>$/;
const PICTOGRAPH = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
const VARIATION_SELECTOR = /️/g;

function isSingleUnicodeEmoji(value: string): boolean {
  if (!PICTOGRAPH.test(value)) return false;
  const segments = [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(value)];
  return segments.length === 1;
}

/**
 * The emoji a starboard counts: one Unicode emoji, or one custom emoji written as `<:name:id>`
 * (`<a:name:id>` for an animated one). Surrounding spaces are removed; anything else is refused.
 */
export const StarboardEmojiSetting = z
  .string({ invalid_type_error: EMOJI_MESSAGE, required_error: EMOJI_MESSAGE })
  .trim()
  .refine((value) => CUSTOM_EMOJI.test(value) || isSingleUnicodeEmoji(value), EMOJI_MESSAGE);

/**
 * What a reaction must match to count: `id` is the custom emoji's ID, or null for a Unicode emoji,
 * which is matched by `name`. The variation selector (U+FE0F) is dropped from a Unicode name, so
 * `⭐` and `⭐️` are the same emoji.
 */
export function parseStarboardEmoji(value: string): { id: string | null; name: string } {
  const trimmed = value.trim();
  const custom = CUSTOM_EMOJI.exec(trimmed);
  if (custom) return { id: custom[3] as string, name: custom[2] as string };
  return { id: null, name: trimmed.replace(VARIATION_SELECTOR, '') };
}
