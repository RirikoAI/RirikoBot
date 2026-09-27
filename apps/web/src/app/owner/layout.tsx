import type { ReactNode } from 'react';
import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { requireOwner } from '@/lib/server/auth/session';

/**
 * Owner console: global data shared by every guild, for bot owners with a recent passkey check.
 * The layout checks first so other users never see the console; each page checks again with
 * its own path, and every action runs `runOwnerAction`.
 */
export default async function OwnerLayout({ children }: { children: ReactNode }) {
  await requireOwner('/owner');
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10">
        <Link href="/servers" className="text-sm text-zinc-400 hover:text-zinc-200">
          ← Your servers
        </Link>
        <div>
          <p className="text-xs font-semibold tracking-wide text-sakura uppercase">Owner console</p>
          <p className="mt-1 text-sm text-zinc-400">
            These settings apply to every server and every member. Saving needs a passkey check from
            the last five minutes, and every change is recorded in the audit log.
          </p>
        </div>
        {children}
      </main>
    </>
  );
}
