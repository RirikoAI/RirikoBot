import { z } from 'zod';

/** Commands a guild can never disable or restrict, so help and the prefix stay reachable. */
export const COMMAND_OVERRIDE_EXEMPT: readonly string[] = ['help', 'ping', 'prefix'];

export const MAX_COMMAND_OVERRIDES = 500;
export const MAX_OVERRIDE_ROLES = 25;
/** Longest cooldown an override can set: one hour. */
export const MAX_COOLDOWN_OVERRIDE_SECONDS = 3600;

/**
 * One override for a command, either server wide (`channelId: null`) or for one channel. A
 * channel row replaces the server row in that channel; fields are not merged.
 */
export interface CommandOverride {
  command: string;
  channelId: string | null;
  enabled: boolean;
  /** When not empty, members need one of these roles. */
  allowedRoleIds: string[];
  /** Members with any of these roles are refused, even if they also hold an allowed role. */
  blockedRoleIds: string[];
  /** Replaces the command's own cooldown; `0` removes it and `null` keeps the command's own. */
  cooldownSeconds: number | null;
}

const SNOWFLAKE = /^\d{17,20}$/;
const COMMAND_NAME = /^[a-z0-9_-]{1,32}$/;

const RoleListSchema = z
  .array(z.string().regex(SNOWFLAKE, 'Each role must be a Discord ID.'), {
    invalid_type_error: 'Enter the roles as a list of IDs.',
  })
  .max(MAX_OVERRIDE_ROLES, `Choose at most ${MAX_OVERRIDE_ROLES} roles.`)
  .default([])
  .transform((ids) => [...new Set(ids)]);

export const CommandOverrideSchema = z
  .object({
    command: z
      .string({ required_error: 'Choose a command.', invalid_type_error: 'Choose a command.' })
      .trim()
      .toLowerCase()
      .regex(COMMAND_NAME, 'Choose a command.')
      .refine(
        (name) => !COMMAND_OVERRIDE_EXEMPT.includes(name),
        (name) => ({ message: `\`${name}\` is always available and cannot be overridden.` }),
      ),
    channelId: z
      .string()
      .regex(SNOWFLAKE, 'Channel must be a Discord ID.')
      .nullable()
      .default(null),
    enabled: z.boolean({ invalid_type_error: 'Use true or false.' }).default(true),
    allowedRoleIds: RoleListSchema,
    blockedRoleIds: RoleListSchema,
    cooldownSeconds: z
      .number({ invalid_type_error: 'Cooldown must be a whole number of seconds.' })
      .int('Cooldown must be a whole number of seconds.')
      .min(0, 'Cooldown cannot be negative.')
      .max(MAX_COOLDOWN_OVERRIDE_SECONDS, 'Cooldowns can last at most 1 hour.')
      .nullable()
      .default(null),
  })
  .strict()
  .superRefine((row, ctx) => {
    if (row.allowedRoleIds.some((id) => row.blockedRoleIds.includes(id))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['blockedRoleIds'],
        message: 'A role cannot be both allowed and blocked.',
      });
    }
  });

/** Stored order of overrides: by command, then the server row before channel rows. */
export function compareCommandOverrides(a: CommandOverride, b: CommandOverride): number {
  if (a.command !== b.command) return a.command < b.command ? -1 : 1;
  const left = a.channelId ?? '';
  const right = b.channelId ?? '';
  return left === right ? 0 : left < right ? -1 : 1;
}

function isDefault(row: CommandOverride): boolean {
  return (
    row.enabled &&
    row.allowedRoleIds.length === 0 &&
    row.blockedRoleIds.length === 0 &&
    row.cooldownSeconds === null
  );
}

/**
 * A guild's overrides: one row per command and channel. Rows that change nothing are dropped
 * and the rest are sorted by command, server row first, so equal lists compare equal.
 */
export const CommandOverridesSchema = z
  .array(CommandOverrideSchema, { invalid_type_error: 'Enter the overrides as a list.' })
  .max(MAX_COMMAND_OVERRIDES, `A server can have at most ${MAX_COMMAND_OVERRIDES} overrides.`)
  .superRefine((rows, ctx) => {
    const seen = new Set<string>();
    for (const row of rows) {
      const key = `${row.command}/${row.channelId ?? ''}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: row.channelId
            ? `\`${row.command}\` has two overrides for the same channel.`
            : `\`${row.command}\` has two server-wide overrides.`,
        });
        return;
      }
      seen.add(key);
    }
  })
  .transform((rows): CommandOverride[] =>
    rows.filter((row) => !isDefault(row)).sort(compareCommandOverrides),
  );

/** The override that applies to `command` in `channelId`: the channel's row, else the server row. */
export function resolveCommandOverride(
  overrides: readonly CommandOverride[],
  command: string,
  channelId: string | null,
): CommandOverride | null {
  let serverRow: CommandOverride | null = null;
  for (const row of overrides) {
    if (row.command !== command) continue;
    if (channelId !== null && row.channelId === channelId) return row;
    if (row.channelId === null) serverRow = row;
  }
  return serverRow;
}
