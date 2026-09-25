import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { GuildIcon } from '@/components/guild-icon';
import { SiteHeader } from '@/components/site-header';
import { requireSession } from '@/lib/server/auth/session';
import { botInviteUrl } from '@/lib/server/guilds/permissions';
import { getWebServices } from '@/lib/server/services';

export const metadata: Metadata = { title: 'Your servers · Ririko Dashboard' };

export default async function ServersPage() {
  const session = await requireSession('/servers');
  const { config, guildAccess } = await getWebServices();
  const guilds = await guildAccess.listManageableGuilds(session);
  if (!guilds) redirect('/api/auth/login?returnTo=%2Fservers');

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="text-2xl font-bold">Choose a server</h1>
        <p className="mt-2 text-zinc-400">
          Servers where you have the Manage Server or Administrator permission.
        </p>

        {guilds.length === 0 ? (
          <p className="mt-10 rounded-lg border border-edge bg-panel p-6 text-zinc-300">
            You don&apos;t manage any Discord servers yet. Ask a server owner for the Manage Server
            permission, then sign in again.
          </p>
        ) : (
          <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {guilds.map((guild) => (
              <li
                key={guild.id}
                className="flex items-center gap-4 rounded-lg border border-edge bg-panel p-4"
              >
                <GuildIcon guild={guild} />
                <span className="min-w-0 flex-1 truncate font-medium" title={guild.name}>
                  {guild.name}
                </span>
                {guild.botPresent ? (
                  <Link
                    href={`/dashboard/${guild.id}`}
                    className="rounded-md bg-sakura-strong px-3 py-1.5 text-sm font-semibold text-white hover:bg-sakura"
                  >
                    Manage
                  </Link>
                ) : (
                  <a
                    href={botInviteUrl(config.DISCORD_CLIENT_ID, guild.id)}
                    className="rounded-md border border-edge px-3 py-1.5 text-sm text-zinc-300 hover:bg-edge"
                  >
                    Invite Ririko
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
