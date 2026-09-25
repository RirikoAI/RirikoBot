import 'server-only';
import { CDN } from '@discordjs/rest';

const cdn = new CDN();

export function userAvatarUrl(user: { id: string; avatar: string | null }): string {
  if (user.avatar) return cdn.avatar(user.id, user.avatar, { extension: 'png', size: 128 });
  // Default avatar index for accounts on the unique-username system.
  return cdn.defaultAvatar(Number((BigInt(user.id) >> 22n) % 6n));
}

export function guildIconUrl(guild: { id: string; icon: string | null }): string | null {
  return guild.icon ? cdn.icon(guild.id, guild.icon, { extension: 'png', size: 128 }) : null;
}
