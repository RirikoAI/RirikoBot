import { z } from 'zod';
import { canonicalTimeZone } from '../time/time-zone.js';

/** Prefix used in DMs and in guilds that have not set their own. */
export const DEFAULT_COMMAND_PREFIX = '!';

/** Command prefix rules shared by `/prefix`, the dashboard and `ririko guild:config`. */
export const PrefixSchema = z
  .string()
  .trim()
  .min(1, 'The command prefix cannot be empty.')
  .max(5, 'The command prefix must be between 1 and 5 characters long.')
  .refine((prefix) => !/\s/.test(prefix), 'The command prefix cannot contain spaces or tabs.')
  .refine(
    (prefix) => !prefix.includes('`'),
    'The command prefix cannot contain backtick (`) characters.',
  )
  .refine(
    (prefix) => !prefix.startsWith('@') && !prefix.startsWith('#'),
    'The command prefix cannot start with `@` or `#` to avoid collisions with mentions.',
  );

/** IANA time zone, canonicalised (`asia/tokyo` becomes `Asia/Tokyo`). */
export const TimezoneSchema = z.string().transform((value, ctx) => {
  const canonical = canonicalTimeZone(value);
  if (!canonical) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `\`${value}\` is not a valid IANA timezone name. Please use standard format like \`Asia/Kuala_Lumpur\`, \`America/New_York\`, or \`Europe/London\`.`,
    });
    return z.NEVER;
  }
  return canonical;
});

/**
 * Guild settings editable from the dashboard and the CLI, one strict schema per module. Only
 * keys the bot reads belong here (docs/dashboard.md section 3.2).
 */
export const GuildConfigSchemas = {
  general: z
    .object({
      prefix: PrefixSchema.describe('Prefix for text commands, 1 to 5 characters'),
      timezone: TimezoneSchema.describe('IANA time zone used for reminders and guild times'),
    })
    .strict(),
} as const;

export type GuildConfigModule = keyof typeof GuildConfigSchemas;
export type GuildConfigValues<M extends GuildConfigModule> = z.output<
  (typeof GuildConfigSchemas)[M]
>;

export const GUILD_CONFIG_MODULES = Object.keys(GuildConfigSchemas) as GuildConfigModule[];

export function isGuildConfigModule(value: string): value is GuildConfigModule {
  return Object.hasOwn(GuildConfigSchemas, value);
}
