import type { ReactNode } from 'react';
import Link from 'next/link';
import { GuildIcon } from '@/components/guild-icon';
import { GuildNav } from '@/components/guild-nav';
import { SiteHeader } from '@/components/site-header';
import { requireGuildAccess } from '@/lib/server/guilds/require-guild-access';

/**
 * Guild chrome. Layouts are not re-rendered on every navigation, so each page and Server
 * Action still calls `requireGuildAccess` itself; this call only protects the chrome.
 */
export default async function GuildLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const { guild } = await requireGuildAccess(guildId);

  return (
    <>
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 py-8 md:grid md:grid-cols-[14rem_1fr] md:gap-10">
        <aside className="mb-6 flex flex-col gap-6 md:mb-0">
          <Link href="/servers" className="text-sm text-zinc-400 hover:text-zinc-200">
            ← All servers
          </Link>
          <div className="flex items-center gap-3">
            <GuildIcon guild={guild} size={40} />
            <span className="min-w-0 truncate font-semibold" title={guild.name}>
              {guild.name}
            </span>
          </div>
          <GuildNav guildId={guild.id} />
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </>
  );
}
