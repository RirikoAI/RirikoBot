import Link from 'next/link';
import { getCurrentUser, isBotOwner } from '@/lib/server/auth/session';
import { UserMenu } from './user-menu';

export async function SiteHeader() {
  const user = await getCurrentUser();
  const owner = user ? await isBotOwner(user.id) : false;
  return (
    <header className="border-b border-edge">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Ririko <span className="text-sakura">Dashboard</span>
        </Link>
        {user ? <UserMenu user={user} owner={owner} /> : null}
      </div>
    </header>
  );
}
