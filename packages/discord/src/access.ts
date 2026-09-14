import { AppError, hasPermissions } from '@ririko/core';
import type { ActorContext, GuildSettings } from '@ririko/core';
import type { CommandMetadata } from './contracts.js';

/** One access policy is shared by invocation and help visibility. Ownership is not a guild bypass. */
export function commandAccessError(command: CommandMetadata, actor: ActorContext, settings: GuildSettings | null): AppError | null {
  if (command.guildOnly && !actor.guildId) return new AppError('GUILD_ONLY', 'Use this command in a server.');
  if (actor.guildId && settings?.guildId !== actor.guildId) return new AppError('UNAVAILABLE', 'Server settings could not be loaded.');
  if (settings && settings.guildId !== actor.guildId) return new AppError('UNAVAILABLE', 'Server settings do not match the current context.');
  if (command.ownerOnly && !actor.isOwner) return new AppError('FORBIDDEN', 'Only the bot owner can use this command.');
  if (!hasPermissions(actor.permissions, command.permissions ?? [])) return new AppError('FORBIDDEN', 'You do not have permission to use this command.');
  if (!hasPermissions(actor.botPermissions, command.botPermissions ?? [])) return new AppError('BOT_PERMISSIONS', 'The bot lacks the permissions needed for this command.');
  if (settings) {
    if (settings.modules[command.module] !== true) return new AppError('DISABLED', 'This module is disabled in this server.');
    const policy = settings.commands[command.name];
    if (policy?.channels && Object.keys(policy.channels).length && !actor.channelId) return new AppError('UNAVAILABLE', 'Channel permissions could not be verified.');
    if (policy?.enabled === false) return new AppError('DISABLED', 'This command is disabled in this server.');
    if (policy?.allowedRoleIds?.length && !policy.allowedRoleIds.some((roleId) => actor.roles.includes(roleId))) {
      return new AppError('FORBIDDEN', 'You need an allowed server role to use this command.');
    }
    if (actor.channelId && policy?.channels?.[actor.channelId] === false) return new AppError('DISABLED', 'This command is disabled in this channel.');
  }
  return null;
}
