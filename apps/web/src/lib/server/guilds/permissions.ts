import 'server-only';
import { PermissionFlagsBits } from 'discord-api-types/v10';

/**
 * Permissions requested when inviting the bot. Same set as the 1.4.0 invite link, so servers
 * that switch versions grant exactly what they granted before; it deliberately omits
 * Administrator.
 */
export const BOT_INVITE_PERMISSIONS = 626721090433015n;

/** A dashboard manager must own the guild or hold Manage Server (0x20) or Administrator (0x8). */
export function canManageGuild(guild: { owner?: boolean; permissions: string }): boolean {
  if (guild.owner) return true;
  let permissions: bigint;
  try {
    permissions = BigInt(guild.permissions);
  } catch {
    return false;
  }
  const required = PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator;
  return (permissions & required) !== 0n;
}

export function botInviteUrl(clientId: string, guildId: string): string {
  const url = new URL('https://discord.com/oauth2/authorize');
  url.search = new URLSearchParams({
    client_id: clientId,
    scope: 'bot applications.commands',
    permissions: BOT_INVITE_PERMISSIONS.toString(),
    guild_id: guildId,
    disable_guild_select: 'true',
  }).toString();
  return url.toString();
}
