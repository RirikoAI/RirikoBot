import type { InviteSource } from '@ririko/database';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { OwnerNav } from '@/components/owner-nav';
import { TopCommands } from '@/components/top-commands';
import { UsageChart } from '@/components/usage-chart';
import { formatDay, numberFormat } from '@/lib/chart-format';
import { requireOwner } from '@/lib/server/auth/session';
import { USAGE_DAYS } from '@/lib/server/guilds/guild-overview';
import type { UserSummary } from '@/lib/server/guilds/user-directory';
import { loadServerUsage, type ServerRow } from '@/lib/server/owner/server-usage';
import { getWebServices } from '@/lib/server/services';

export const metadata: Metadata = { title: 'Servers · Owner Console · Ririko Dashboard' };

const joinedFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });
const DISCORD_CDN = 'https://cdn.discordapp.com/';

function ServerIcon({ server }: { server: ServerRow }) {
  if (server.iconUrl?.startsWith(DISCORD_CDN)) {
    return <Image src={server.iconUrl} alt="" width={32} height={32} className="rounded-lg" />;
  }
  const initials = server.name
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .slice(0, 3);
  return (
    <span
      aria-hidden
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-edge text-xs font-semibold text-zinc-300"
    >
      {initials}
    </span>
  );
}

const INVITE_SOURCE_LABELS: Record<InviteSource, string> = {
  oauth: 'via invite link',
  audit_log: 'via audit log',
  integration: 'via integrations',
};

/**
 * A Discord user as "username (ID)", with the display name as the tooltip, so the owner can copy
 * it to look the person up. Discord may not return the user: then only the ID is shown.
 */
function UserCell({ id, users }: { id: string; users: ReadonlyMap<string, UserSummary> }) {
  const user = users.get(id);
  return user ? (
    <span title={user.name} className="break-all select-text">{`${user.username} (${id})`}</span>
  ) : (
    <span className="font-mono break-all select-text">{id}</span>
  );
}

function ServerTable({
  servers,
  users,
  selectedId,
}: {
  servers: ServerRow[];
  users: ReadonlyMap<string, UserSummary>;
  selectedId: string | undefined;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[56rem] text-left text-sm">
        <thead className="text-zinc-400">
          <tr>
            <th className="py-2 pr-3 font-normal">Server</th>
            <th className="py-2 pr-3 font-normal">Owner</th>
            <th className="py-2 pr-3 font-normal">Invited by</th>
            <th className="py-2 pr-3 font-normal">Joined (UTC)</th>
            <th className="py-2 pr-3 text-right font-normal">Commands</th>
            <th className="py-2 pr-3 font-normal">Busiest day</th>
            <th className="py-2 font-normal">Top command</th>
          </tr>
        </thead>
        <tbody>
          {servers.map((server) => (
            <tr
              key={server.id}
              className={`border-t border-edge ${server.id === selectedId ? 'bg-ink' : ''}`}
            >
              <td className="py-2 pr-3">
                <div className="flex items-center gap-3">
                  <ServerIcon server={server} />
                  <div className="min-w-0">
                    <Link
                      href={`/owner/servers?guild=${server.id}`}
                      className="font-medium text-zinc-100 hover:underline"
                    >
                      {server.name}
                    </Link>
                    <p className="font-mono text-xs text-zinc-400">{server.id}</p>
                  </div>
                </div>
              </td>
              <td className="py-2 pr-3 text-zinc-200">
                <UserCell id={server.ownerId} users={users} />
              </td>
              <td className="py-2 pr-3 text-zinc-200">
                {server.inviterId ? (
                  <>
                    <UserCell id={server.inviterId} users={users} />
                    {server.inviterVia ? (
                      <p className="text-xs text-zinc-400">
                        {INVITE_SOURCE_LABELS[server.inviterVia]}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <>
                    Unknown
                    <p className="text-xs text-zinc-400">Contact the owner</p>
                  </>
                )}
              </td>
              <td className="py-2 pr-3 text-zinc-300">
                {joinedFormat.format(new Date(server.joinedAt))}
              </td>
              <td className="py-2 pr-3 text-right text-zinc-100 tabular-nums">
                {numberFormat.format(server.total)}
              </td>
              <td className="py-2 pr-3 text-zinc-300">
                {server.busiestDay
                  ? `${formatDay(server.busiestDay.day)} · ${numberFormat.format(server.busiestDay.count)}`
                  : '—'}
              </td>
              <td className="py-2 text-zinc-300">
                {server.topCommand ? (
                  <>
                    <span className="font-mono text-zinc-200">{server.topCommand.commandName}</span>{' '}
                    <span className="tabular-nums">
                      · {numberFormat.format(server.topCommand.count)}
                    </span>
                  </>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function OwnerServersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireOwner('/owner/servers');
  const { guild } = await searchParams;
  const { guildRegistry, botActivity, userDirectory } = await getWebServices();
  const { active, inactive, selected, usage, users } = await loadServerUsage(
    { guilds: guildRegistry, activity: botActivity, users: userDirectory },
    typeof guild === 'string' ? guild : undefined,
  );
  const hasUnknownInviter = [...active, ...inactive].some((server) => server.inviterId === null);

  return (
    <section className="flex flex-col gap-6">
      <OwnerNav current="/owner/servers" />
      <header>
        <h1 className="text-2xl font-bold">Servers</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-400">
          Every server Ririko is in, who invited it and how many commands each server ran in the
          last {USAGE_DAYS} days. This page is read-only. Days are in UTC.
        </p>
      </header>

      <section className="rounded-md border border-edge bg-panel p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-zinc-100">
            Commands run, last {USAGE_DAYS} days ·{' '}
            <span className="font-normal text-zinc-300">
              {selected ? selected.name : 'all servers'}
            </span>
          </h2>
          {selected ? (
            <Link href="/owner/servers" className="text-sm text-zinc-400 hover:text-zinc-200">
              All servers
            </Link>
          ) : null}
        </div>
        {usage.total === 0 ? (
          <p className="mt-3 text-sm text-zinc-400">
            No commands have been run {selected ? 'in this server' : 'in any server'} in the last{' '}
            {USAGE_DAYS} days.
          </p>
        ) : (
          <>
            <p className="mt-3 text-sm text-zinc-400">
              <span className="font-semibold text-zinc-100 tabular-nums">
                {numberFormat.format(usage.total)}
              </span>{' '}
              commands.
            </p>
            <div className="mt-3">
              <UsageChart days={usage.days} />
            </div>
          </>
        )}
        <h3 className="mt-5 text-sm font-semibold text-zinc-100">Most used commands</h3>
        <div className="mt-2 max-w-xl">
          <TopCommands commands={usage.top} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-zinc-100">
          Servers Ririko is in ({numberFormat.format(active.length)})
        </h2>
        {active.length === 0 ? (
          <p className="text-sm text-zinc-400">
            No servers are recorded yet. The bot records them when it starts.
          </p>
        ) : (
          <ServerTable servers={active} users={users} selectedId={selected?.id} />
        )}
        {hasUnknownInviter ? (
          <p className="text-xs text-zinc-400">
            &ldquo;Unknown&rdquo; means no invite link, audit log or integration said who added
            Ririko: Discord keeps the audit log for 45 days only, and the bot needs the View Audit
            Log permission. The owner is the contact for those servers.
          </p>
        ) : null}
      </section>

      {inactive.length > 0 ? (
        <details className="rounded-md border border-edge p-4">
          <summary className="cursor-pointer text-base font-semibold text-zinc-100">
            Servers Ririko has left ({numberFormat.format(inactive.length)})
          </summary>
          <div className="mt-3">
            <ServerTable servers={inactive} users={users} selectedId={selected?.id} />
          </div>
        </details>
      ) : null}
    </section>
  );
}
