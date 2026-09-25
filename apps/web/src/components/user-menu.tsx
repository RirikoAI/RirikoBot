import Image from 'next/image';
import Link from 'next/link';
import type { CurrentUser } from '@/lib/server/auth/session';

export function UserMenu({ user }: { user: CurrentUser }) {
  return (
    <div className="flex items-center gap-3">
      {user.avatarUrl ? (
        <Image src={user.avatarUrl} alt="" width={32} height={32} className="rounded-full" />
      ) : null}
      <span className="text-sm font-medium">{user.name}</span>
      <Link href="/account/security" className="text-sm text-zinc-400 hover:text-zinc-200">
        Security
      </Link>
      <form action="/api/auth/logout" method="post">
        <button
          type="submit"
          className="rounded-md border border-edge px-3 py-1.5 text-sm text-zinc-300 hover:bg-panel focus-visible:outline-2 focus-visible:outline-sakura"
        >
          Sign out
        </button>
      </form>
    </div>
  );
}
