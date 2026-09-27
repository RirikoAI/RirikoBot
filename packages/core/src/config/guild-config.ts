import { z } from 'zod';
import { canonicalTimeZone } from '../time/time-zone.js';
import { AUTOMOD_ACTIONS, EscalationPolicySchema } from './moderation-settings.js';
import { CommandOverridesSchema } from './command-overrides.js';
import { AutoVoiceHubsSchema } from './auto-voice.js';
import { GameRulesSchema, MAX_GAME_WAGER_LIMIT } from './games.js';

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

const SNOWFLAKE = /^\d{17,20}$/;

function splitIdList(text: string): unknown {
  if (text.trim().startsWith('[')) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
  return text.split(/[\s,]+/).filter(Boolean);
}
const TRUE_WORDS = new Set(['true', 'on', 'yes', '1']);
const FALSE_WORDS = new Set(['false', 'off', 'no', '0']);

/*
 * Setting types below accept typed values from the dashboard and plain strings from
 * `ririko guild:config`, so both paths share one schema.
 */

/** A boolean; the CLI may pass `true`/`false`, `on`/`off`, `yes`/`no` or `1`/`0`. */
export const FlagSetting = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    const word = value.trim().toLowerCase();
    if (TRUE_WORDS.has(word)) return true;
    if (FALSE_WORDS.has(word)) return false;
    return value;
  },
  z.boolean({ invalid_type_error: 'Use true or false.', required_error: 'Use true or false.' }),
);

/** A whole number from `min` to `max`; numeric strings are converted. */
export function IntSetting(min: number, max: number) {
  const message = `Enter a whole number from ${min} to ${max}.`;
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() !== '' ? Number(value.trim()) : value),
    z
      .number({ invalid_type_error: message, required_error: message })
      .int(message)
      .min(min, message)
      .max(max, message),
  );
}

/** A whole number from `min` to `max`, or `null` for none; an empty string (or `none`) clears it. */
export function OptionalIntSetting(min: number, max: number) {
  const message = `Enter a whole number from ${min} to ${max}, or leave it empty.`;
  return z.preprocess(
    (value) => {
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      return trimmed === '' || trimmed.toLowerCase() === 'none' ? null : Number(trimmed);
    },
    z
      .number({ invalid_type_error: message })
      .int(message)
      .min(min, message)
      .max(max, message)
      .nullable(),
  );
}

/** A Discord ID, or `null` for none; an empty string (or `none` from the CLI) clears it. */
export const OptionalSnowflakeSetting = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' || trimmed.toLowerCase() === 'none' ? null : trimmed;
}, z.string().regex(SNOWFLAKE, 'Must be a Discord ID.').nullable());

/** Up to `max` distinct Discord IDs; the CLI may pass them comma or space separated, or as a JSON list. */
export function SnowflakeListSetting(max: number) {
  return z.preprocess(
    (value) => {
      const list = typeof value === 'string' ? splitIdList(value) : value;
      return Array.isArray(list) ? [...new Set(list)] : list;
    },
    z
      .array(z.string().regex(SNOWFLAKE, 'Each entry must be a Discord ID.'), {
        invalid_type_error: 'Enter a list of Discord IDs.',
      })
      .max(max, `Choose at most ${max}.`),
  );
}

/** A structured value (such as a list of rows); the CLI and forms may pass it as JSON text. */
export function JsonSetting<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => {
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  }, schema);
}

const AutoModActionSetting = z.enum(AUTOMOD_ACTIONS, {
  errorMap: () => ({ message: `Choose one of ${AUTOMOD_ACTIONS.join(', ')}.` }),
});
const MAX_EXEMPTIONS = 25;
const MAX_JOIN_ROLES = 10;
const MAX_NO_XP_CHANNELS = 50;
/** Highest per-guild XP rate. Levels also raise the global bank capacity, so the rate is capped. */
export const MAX_XP_RATE_PERCENT = 300;
/** Highest music volume in percent; the player clamps to it too. */
export const MAX_MUSIC_VOLUME = 150;
/** Volume a music session starts at when the guild has not chosen one. */
export const DEFAULT_MUSIC_VOLUME = 80;
const AUTOMOD_ACTION_HELP = `${AUTOMOD_ACTIONS.join(', ')}; every match also deletes the message`;

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
  moderation: z
    .object({
      escalationSteps: JsonSetting(EscalationPolicySchema).describe(
        'Warning escalation steps as JSON, e.g. [{"warnThreshold":3,"action":"TIMEOUT","durationSeconds":600}]',
      ),
    })
    .strict(),
  automod: z
    .object({
      inviteFilterEnabled: FlagSetting.describe('Invite filter on or off'),
      inviteFilterAction: AutoModActionSetting.describe(
        `Invite filter action: ${AUTOMOD_ACTION_HELP}`,
      ),
      inviteFilterExemptRoleIds: SnowflakeListSetting(MAX_EXEMPTIONS).describe(
        'Role IDs the invite filter ignores, comma separated',
      ),
      inviteFilterExemptChannelIds: SnowflakeListSetting(MAX_EXEMPTIONS).describe(
        'Channel IDs where invites are allowed, comma separated',
      ),
      phishingShieldEnabled: FlagSetting.describe('Phishing shield on or off'),
      phishingShieldAction: AutoModActionSetting.describe(
        `Phishing shield action: ${AUTOMOD_ACTION_HELP}`,
      ),
      phishingShieldExemptRoleIds: SnowflakeListSetting(MAX_EXEMPTIONS).describe(
        'Role IDs the phishing shield ignores, comma separated',
      ),
      phishingShieldExemptChannelIds: SnowflakeListSetting(MAX_EXEMPTIONS).describe(
        'Channel IDs the phishing shield ignores, comma separated',
      ),
      mentionSpamEnabled: FlagSetting.describe('Mention spam filter on or off'),
      mentionSpamAction: AutoModActionSetting.describe(
        `Mention spam action: ${AUTOMOD_ACTION_HELP}`,
      ),
      mentionSpamLimit: IntSetting(1, 50).describe(
        'Mentions allowed in one message (1 to 50); more is a match',
      ),
      mentionSpamExemptRoleIds: SnowflakeListSetting(MAX_EXEMPTIONS).describe(
        'Role IDs the mention spam filter ignores, comma separated',
      ),
      mentionSpamExemptChannelIds: SnowflakeListSetting(MAX_EXEMPTIONS).describe(
        'Channel IDs the mention spam filter ignores, comma separated',
      ),
      burstSpamEnabled: FlagSetting.describe('Burst spam filter on or off'),
      burstSpamAction: AutoModActionSetting.describe(`Burst spam action: ${AUTOMOD_ACTION_HELP}`),
      burstSpamLimit: IntSetting(2, 20).describe(
        'Messages allowed within 3 seconds (2 to 20); more is a match',
      ),
      burstSpamExemptRoleIds: SnowflakeListSetting(MAX_EXEMPTIONS).describe(
        'Role IDs the burst spam filter ignores, comma separated',
      ),
      burstSpamExemptChannelIds: SnowflakeListSetting(MAX_EXEMPTIONS).describe(
        'Channel IDs the burst spam filter ignores, comma separated',
      ),
    })
    .strict(),
  logging: z
    .object({
      logChannelId: OptionalSnowflakeSetting.describe(
        'Channel for moderation cases, anti-raid alerts and dashboard change notices; empty for none',
      ),
    })
    .strict(),
  commands: z
    .object({
      overrides: JsonSetting(CommandOverridesSchema).describe(
        'Command overrides as JSON; channelId null is server wide, e.g. [{"command":"rps","channelId":null,"enabled":false}]',
      ),
    })
    .strict(),
  autoroles: z
    .object({
      enabled: FlagSetting.describe('Give join roles to new members and bots'),
      humanRoleIds: SnowflakeListSetting(MAX_JOIN_ROLES).describe(
        'Role IDs given to members who join, comma separated',
      ),
      botRoleIds: SnowflakeListSetting(MAX_JOIN_ROLES).describe(
        'Role IDs given to bots that join, comma separated',
      ),
      verificationRoleId: OptionalSnowflakeSetting.describe(
        'Role given by the verification button (/autorole send-verify); empty for none',
      ),
    })
    .strict(),
  autovoice: z
    .object({
      hubs: JsonSetting(AutoVoiceHubsSchema).describe(
        'Join-to-create hubs as JSON, e.g. [{"channelId":"123...","nameTemplate":"Room of {user}","userLimit":0,"bitrate":64000}]',
      ),
    })
    .strict(),
  xp: z
    .object({
      levelUpAnnouncements: FlagSetting.describe('Announce level-ups on or off'),
      levelUpChannelId: OptionalSnowflakeSetting.describe(
        'Channel for level-up messages; empty posts in the channel where the member levelled up',
      ),
      xpRatePercent: IntSetting(0, MAX_XP_RATE_PERCENT).describe(
        `XP rate in percent (0 to ${MAX_XP_RATE_PERCENT}); 100 is normal, 0 turns XP off`,
      ),
      noXpChannelIds: SnowflakeListSetting(MAX_NO_XP_CHANNELS).describe(
        'Channel IDs where members earn no XP, comma separated',
      ),
      noXpRoleIds: SnowflakeListSetting(MAX_EXEMPTIONS).describe(
        'Role IDs whose members earn no XP, comma separated',
      ),
      voiceXpEnabled: FlagSetting.describe(
        'Voice rewards on or off (credits and XP for time in voice with another unmuted member)',
      ),
    })
    .strict(),
  games: z
    .object({
      maxWager: OptionalIntSetting(1, MAX_GAME_WAGER_LIMIT).describe(
        'Most credits a member can wager on coinflip, dice, highlow, rps and tictactoe; empty for no limit',
      ),
      rules: JsonSetting(GameRulesSchema).describe(
        'Server-wide game rules as JSON; cooldownSeconds null keeps the game default, e.g. [{"command":"rps","enabled":false}]',
      ),
    })
    .strict(),
  music: z
    .object({
      defaultVolume: IntSetting(0, MAX_MUSIC_VOLUME).describe(
        `Volume a new music session starts at, 0 to ${MAX_MUSIC_VOLUME} percent`,
      ),
      musicChannelId: OptionalSnowflakeSetting.describe(
        'Channel with the music controller, where song names and links are played; empty for none',
      ),
      djRoleId: OptionalSnowflakeSetting.describe(
        'Role needed to pause, skip, stop, loop, shuffle, seek, filter or change the volume; empty lets everyone (Manage Server always can)',
      ),
      autoLeaveEmpty: FlagSetting.describe(
        'Leave the voice channel 3 minutes after the last member leaves it',
      ),
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
