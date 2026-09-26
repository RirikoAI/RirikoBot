import { PermissionFlagsBits, type GuildMember } from 'discord.js';
import { COMMAND_OVERRIDE_EXEMPT, type CommandOverride } from '@ririko/core';
import type { CommandContext } from '../command/types.js';
import type { CommandMiddleware, MiddlewareNext } from './types.js';
import { CommandDisabledError, CommandPermissionError } from '../errors/index.js';

export interface CommandOverrideMiddlewareOptions {
  /** The override for a command in a channel, or null when none applies. */
  resolve: (
    guildId: string,
    channelId: string | null,
    commandName: string,
  ) => Promise<CommandOverride | null>;

  /** Commands overrides never apply to. Defaults to `COMMAND_OVERRIDE_EXEMPT`. */
  exemptCommands?: readonly string[] | undefined;

  /** Who ignores overrides. Defaults to members with Manage Server, so staff cannot lock themselves out. */
  canBypass?: ((ctx: CommandContext, member: GuildMember) => boolean) | undefined;
}

/** The channel overrides are keyed by: a thread uses its parent channel. */
export function overrideChannelId(ctx: CommandContext): string | null {
  const channel = ctx.channel;
  if (channel && 'isThread' in channel && channel.isThread()) return channel.parentId;
  return ctx.channelId || null;
}

/** The invoking member with its role cache; a slash interaction may carry only the raw API member. */
async function resolveMember(ctx: CommandContext): Promise<GuildMember | null> {
  const member = ctx.member as Partial<GuildMember> | null;
  if (member?.roles && 'cache' in member.roles) return member as GuildMember;
  return ctx.guild ? ctx.guild.members.fetch(ctx.user.id).catch(() => null) : null;
}

const hasManageGuild = (_ctx: CommandContext, member: GuildMember): boolean =>
  member.permissions.has(PermissionFlagsBits.ManageGuild);

/**
 * Applies a guild's command overrides (`command_settings`): a disabled command, a blocked role
 * or a missing allowed role stops the command. The channel's row replaces the server row.
 */
export function createCommandOverrideMiddleware(
  options: CommandOverrideMiddlewareOptions,
): CommandMiddleware {
  const exempt = new Set(options.exemptCommands ?? COMMAND_OVERRIDE_EXEMPT);
  const canBypass = options.canBypass ?? hasManageGuild;

  return async (ctx: CommandContext, next: MiddlewareNext): Promise<void> => {
    const name = ctx.command?.metadata.name ?? ctx.commandName;
    if (!ctx.guildId || !ctx.command || exempt.has(name)) {
      await next();
      return;
    }

    const override = await options.resolve(ctx.guildId, overrideChannelId(ctx), name);
    if (!override) {
      await next();
      return;
    }

    const where = override.channelId ? 'in this channel' : 'in this server';
    const needsRoles = override.allowedRoleIds.length > 0 || override.blockedRoleIds.length > 0;
    if (override.enabled && !needsRoles) {
      await next();
      return;
    }

    const member = await resolveMember(ctx);
    if (member && canBypass(ctx, member)) {
      await next();
      return;
    }

    if (!override.enabled) {
      throw new CommandDisabledError(`\`${name}\` is disabled ${where}.`);
    }

    const roles = member?.roles.cache;
    if (override.blockedRoleIds.some((id) => roles?.has(id))) {
      throw new CommandPermissionError(`One of your roles cannot use \`${name}\` ${where}.`);
    }
    if (
      override.allowedRoleIds.length > 0 &&
      !override.allowedRoleIds.some((id) => roles?.has(id))
    ) {
      throw new CommandPermissionError(`\`${name}\` is limited to certain roles ${where}.`);
    }

    await next();
  };
}
