import type { Metadata } from 'next';
import Link from 'next/link';
import { GuildIcon } from '@/components/guild-icon';
import { SiteHeader } from '@/components/site-header';
import { requireGuildAccess } from '@/lib/server/guilds/require-guild-access';

export const metadata: Metadata = { title: 'Server · Ririko Dashboard' };

export default async function GuildDashboardPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const { guild } = await requireGuildAccess(guildId);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <Link href="/servers" className="text-sm text-zinc-400 hover:text-zinc-200">
          ← All servers
        </Link>
        <div className="mt-6 flex items-center gap-4">
          <GuildIcon guild={guild} size={64} />
          <div>
            <h1 className="text-2xl font-bold">{guild.name}</h1>
            <p className="text-sm text-zinc-400">You can manage Ririko on this server.</p>
          </div>
        </div>
      </main>
    </>
  );
}
