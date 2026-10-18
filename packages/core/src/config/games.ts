import { z } from 'zod';
import { MAX_COOLDOWN_OVERRIDE_SECONDS } from './command-overrides.js';

/** Mini-games that take a credits wager; the Games page and the maximum wager cover these. */
export const WAGER_GAME_COMMANDS = ['coinflip', 'dice', 'highlow', 'rps', 'tictactoe'] as const;
export type WagerGameCommand = (typeof WAGER_GAME_COMMANDS)[number];

/** Highest maximum wager a guild can set. */
export const MAX_GAME_WAGER_LIMIT = 1_000_000_000;

/**
 * A game's server-wide rule. It is stored as the command's server-wide `command_settings` row,
 * so the Commands page shows the same rule; roles and channel rules stay there.
 */
export interface GameRule {
  command: WagerGameCommand;
  enabled: boolean;
  /** Replaces the game's own cooldown; `0` removes it and `null` keeps the game's own. */
  cooldownSeconds: number | null;
}

const GameRuleSchema = z
  .object({
    command: z.enum(WAGER_GAME_COMMANDS, {
      errorMap: () => ({ message: `Choose one of ${WAGER_GAME_COMMANDS.join(', ')}.` }),
    }),
    enabled: z.boolean({ invalid_type_error: 'Use true or false.' }).default(true),
    cooldownSeconds: z
      .number({ invalid_type_error: 'Cooldown must be a whole number of seconds.' })
      .int('Cooldown must be a whole number of seconds.')
      .min(0, 'Cooldown cannot be negative.')
      .max(MAX_COOLDOWN_OVERRIDE_SECONDS, 'Cooldowns can last at most 1 hour.')
      .nullable()
      .default(null),
  })
  .strict();

/** A guild's game rules, one per game. Rules that change nothing are dropped; the rest are sorted. */
export const GameRulesSchema = z
  .array(GameRuleSchema, { invalid_type_error: 'Enter the game rules as a list.' })
  .superRefine((rows, ctx) => {
    const seen = new Set<string>();
    for (const row of rows) {
      if (seen.has(row.command)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `\`${row.command}\` has two rules.`,
        });
        return;
      }
      seen.add(row.command);
    }
  })
  .transform((rows): GameRule[] =>
    rows
      .filter((row) => !row.enabled || row.cooldownSeconds !== null)
      .sort((a, b) => (a.command < b.command ? -1 : a.command > b.command ? 1 : 0)),
  );
