import type { Metadata } from 'next';
import Link from 'next/link';
import { AccountNav } from '@/components/account-nav';
import { SessionList } from '@/components/session-list';
import { SiteHeader } from '@/components/site-header';
import { requireSession } from '@/lib/server/auth/session';
import { getWebServices } from '@/lib/server/services';
import { describeUserAgent } from '@/lib/user-agent';

export const metadata: Metadata = { title: 'Sessions · Ririko Dashboard' };

export default async function SessionsPage() {
  const session = await requireSession('/account/sessions');
  const { sessions } = await getWebServices();
  const list = await sessions.listForUser(session.userId);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
        <Link href="/servers" className="text-sm text-zinc-400 hover:text-zinc-200">
          ← Your servers
        </Link>
        <AccountNav current="/account/sessions" />
        <header>
          <h1 className="text-2xl font-bold">Signed-in sessions</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Every browser signed in to the dashboard with your account. If you do not recognize one,
            sign it out, then secure your Discord account. A sign-in from a new browser is also
            reported to you by DM.
          </p>
        </header>
        <SessionList
          sessions={list.map((entry) => ({
            id: entry.id,
            current: entry.id === session.id,
            browser: describeUserAgent(entry.userAgent),
            userAgent: entry.userAgent,
            ipAddress: entry.ipAddress,
            createdAt: entry.createdAt.toISOString(),
            lastSeenAt: entry.lastSeenAt.toISOString(),
          }))}
        />
      </main>
    </>
  );
}
