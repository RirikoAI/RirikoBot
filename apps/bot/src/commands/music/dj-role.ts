import { PermissionFlagsBits, type APIInteractionGuildMember, type GuildMember } from 'discord.js';
import type { CommandContext, CommandMiddleware } from '@ririko/discord';

/** Reply for members the DJ role keeps from controlling playback. */
export const DJ_ONLY_MESSAGE =
  '🎧 Only members with the DJ role or Manage Server can control playback in this server.';

/** What the DJ check needs to know about a member. */
export interface PlaybackMember {
  hasRole(roleId: string): boolean;
  canManageGuild: boolean;
}

/**
 * Whether a member may pause, skip, stop or otherwise change playback: everyone when the
 * guild has no DJ role, otherwise members with the DJ role or Manage Server.
 */
export function canControlPlayback(
  member: PlaybackMember | null,
  djRoleId: string | null,
): boolean {
  if (!djRoleId) return true;
  if (!member) return false;
  return member.canManageGuild || member.hasRole(djRoleId);
}

/** Reads a cached guild member or the raw member a button interaction may carry. */
export function toPlaybackMember(
  member: GuildMember | APIInteractionGuildMember | null | undefined,
): PlaybackMember | null {
  if (!member) return null;
  if ('cache' in member.roles) {
    const roles = member.roles.cache;
    return {
      hasRole: (roleId) => roles.has(roleId),
      canManageGuild: (member as GuildMember).permissions.has(PermissionFlagsBits.ManageGuild),
    };
  }
  const roleIds = new Set(member.roles as string[]);
  const permissions = BigInt((member as APIInteractionGuildMember).permissions);
  return {
    hasRole: (roleId) => roleIds.has(roleId),
    canManageGuild:
      (permissions & (PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator)) !== 0n,
  };
}

/**
 * Stops a playback command for members without the guild's DJ role. `applies` narrows it,
 * for example to `/volume` with a level (anyone may read the volume).
 */
export function createDjRoleMiddleware(
  getDjRoleId: (guildId: string) => Promise<string | null>,
  applies: (ctx: CommandContext) => boolean = () => true,
): CommandMiddleware {
  return async (ctx, next) => {
    if (!ctx.guildId || !applies(ctx)) return next();
    const djRoleId = await getDjRoleId(ctx.guildId);
    if (!canControlPlayback(toPlaybackMember(ctx.member), djRoleId)) {
      await ctx.reply({ content: DJ_ONLY_MESSAGE, ephemeral: true });
      return;
    }
    return next();
  };
}
