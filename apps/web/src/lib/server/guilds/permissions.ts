import 'server-only';
import { PermissionFlagsBits } from 'discord-api-types/v10';

// The invite permission set lives in @ririko/discord, next to the setup wizard that uses it too.
export { BOT_INVITE_PERMISSIONS } from '@ririko/discord/permissions';

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
