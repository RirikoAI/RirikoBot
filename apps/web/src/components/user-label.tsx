import Image from 'next/image';
import type { UserSummary } from '@/lib/server/guilds/user-directory';

const CLI_ACTOR = /^cli:(.+)$/;

/**
 * A user from a case or audit entry: avatar and name when Discord knows the ID, otherwise the
 * stored ID itself (older AutoMod cases store `AUTOMOD`, CLI changes store `cli:<os user>`).
 */
export function UserLabel({ id, users }: { id: string; users: ReadonlyMap<string, UserSummary> }) {
  const user = users.get(id);
  if (!user) {
    const cli = CLI_ACTOR.exec(id);
    return <span className="font-mono text-xs text-zinc-300">{cli ? `CLI (${cli[1]})` : id}</span>;
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-2" title={`@${user.username} · ${id}`}>
      <Image src={user.avatarUrl} alt="" width={20} height={20} className="rounded-full" />
      <span className="truncate text-zinc-200">{user.name}</span>
    </span>
  );
}
