import Image from 'next/image';
import { guildIconUrl } from '@/lib/server/discord-cdn';

export function GuildIcon({
  guild,
  size = 48,
}: {
  guild: { id: string; name: string; icon: string | null };
  size?: number;
}) {
  const url = guildIconUrl(guild);
  if (url) {
    return <Image src={url} alt="" width={size} height={size} className="rounded-xl" />;
  }
  const initials = guild.name
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .slice(0, 3);
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className="flex items-center justify-center rounded-xl bg-edge text-sm font-semibold text-zinc-300"
    >
      {initials}
    </span>
  );
}
