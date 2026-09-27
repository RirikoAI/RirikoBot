import { z } from 'zod';

/** Welcome and farewell cards: the one place their defaults and limits live. */
export type WelcomerCardKind = 'welcome' | 'farewell';

export const DEFAULT_WELCOME_MESSAGE = 'Welcome to {server}, {user}!';
export const DEFAULT_FAREWELL_MESSAGE = 'Goodbye {user}!';
export const DEFAULT_CARD_TEXT_COLOR = '#ffffff';

/** The card has one line for the message; longer text is shrunk until it fits. */
export const MAX_WELCOMER_MESSAGE_LENGTH = 200;

/** Variables a welcome or farewell message can use. */
export const WELCOMER_MESSAGE_VARIABLES = ['user', 'server', 'memberCount'] as const;

/** Longest background URL accepted. */
export const MAX_BACKGROUND_URL_LENGTH = 2048;

/** Largest uploaded background, and the most pixels on either side. */
export const MAX_BACKGROUND_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_BACKGROUND_UPLOAD_SIDE = 4096;

/** A `#rrggbb` color, stored lowercase. */
export const HexColorSetting = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
  z
    .string({ invalid_type_error: 'Enter a color like #ffffff.' })
    .regex(/^#[0-9a-f]{6}$/, 'Enter a color like #ffffff.'),
);

/** Card message text; it cannot be empty. */
export const WelcomerMessageSetting = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim() : value),
  z
    .string({ invalid_type_error: 'Enter a message.' })
    .min(1, 'Enter a message.')
    .max(MAX_WELCOMER_MESSAGE_LENGTH, `Use at most ${MAX_WELCOMER_MESSAGE_LENGTH} characters.`),
);

/**
 * An http or https URL, or null; an empty string (or `none` from the CLI) clears it. Only the
 * form is checked here: the server checks where it points before fetching it.
 */
export const OptionalImageUrlSetting = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' || trimmed.toLowerCase() === 'none' ? null : trimmed;
  },
  z
    .string({ invalid_type_error: 'Enter a link.' })
    .max(MAX_BACKGROUND_URL_LENGTH, `Use at most ${MAX_BACKGROUND_URL_LENGTH} characters.`)
    .refine((text) => {
      try {
        const url = new URL(text);
        return url.protocol === 'https:' || url.protocol === 'http:';
      } catch {
        return false;
      }
    }, 'Enter an http or https link to an image.')
    .nullable(),
);
