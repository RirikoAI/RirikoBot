import { PermissionFlagsBits, type GuildMember } from 'discord.js';
import type { GuildConfigModule, GuildConfigValues } from '@ririko/core';
import type { CommandContext } from '@ririko/discord';
import { GuildConfigValidationError } from '@ririko/services';
import type { BotServices } from '../../services.js';

/**
 * Helpers for commands that change a guild config module (the same modules the dashboard edits):
 * the manager check, the save with a readable validation reply, and on/off parsing. A command
 * saves through `GuildConfigService.update`, so the change is validated, audited and reaches the
 * running bot like a dashboard save.
 */

/** True for a member with Administrator or Manage Server. */
export function canManageServer(member: GuildMember | null): boolean {
  if (!member) return false;
  const perms = member.permissions;
  return perms.has(PermissionFlagsBits.Administrator) || perms.has(PermissionFlagsBits.ManageGuild);
}

/** The schema's messages without the row number, which means nothing for a single value. */
export function describeValidationError(error: GuildConfigValidationError): string {
  return Object.values(error.fieldErrors)
    .flat()
    .map((message) => message.replace(/^Row \d+: /, ''))
    .join(' ');
}

/**
 * Saves `patch` to `module` for the server the command ran in. When the values fail validation it
 * tells the member why (privately on a slash command) and returns null, and nothing is saved. Any
 * other error is rethrown. Otherwise it returns the saved values.
 */
export async function saveGuildConfig<M extends GuildConfigModule>(
  ctx: CommandContext,
  services: Pick<BotServices, 'guildConfigService'>,
  module: M,
  patch: Record<string, unknown>,
): Promise<GuildConfigValues<M> | null> {
  try {
    const { values } = await services.guildConfigService.update(ctx.guildId!, module, patch, {
      userId: ctx.user.id,
      source: 'discord',
    });
    return values;
  } catch (error) {
    if (!(error instanceof GuildConfigValidationError)) throw error;
    await ctx.reply({
      content: describeValidationError(error),
      ephemeral: true,
      allowedMentions: { parse: [] },
    });
    return null;
  }
}

const ON_WORDS = new Set(['on', 'true', 'yes', 'enable', 'enabled']);
const OFF_WORDS = new Set(['off', 'false', 'no', 'disable', 'disabled']);

/** Reads on/off, true/false, yes/no and enable/disable in any case; null for anything else. */
export function parseToggle(text: string | null | undefined): boolean | null {
  const word = text?.trim().toLowerCase();
  if (!word) return null;
  if (ON_WORDS.has(word)) return true;
  if (OFF_WORDS.has(word)) return false;
  return null;
}
