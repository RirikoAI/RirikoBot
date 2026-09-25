import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { LocalTime } from '@/components/local-time';
import { UsageChart } from '@/components/usage-chart';
import { formatDay, numberFormat } from '@/lib/chart-format';
import { loadGuildOverview, USAGE_DAYS } from '@/lib/server/guilds/guild-overview';
import { requireGuildAccess } from '@/lib/server/guilds/require-guild-access';
import { getWebServices } from '@/lib/server/services';

export const metadata: Metadata = { title: 'Overview · Ririko Dashboard' };

function StatTile({ label, value, note }: { label: string; value: string; note?: ReactNode }) {
  return (
    <div className="rounded-md border border-edge bg-panel p-4">
      <p className="text-sm text-zinc-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-100 tabular-nums">{value}</p>
      {note ? <p className="mt-1 text-xs text-zinc-400">{note}</p> : null}
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-edge bg-panel p-4">
      <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export default async function GuildOverviewPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const { guildResources, botActivity } = await getWebServices();
  const { counts, voice, bot, usage } = await loadGuildOverview(
    { resources: guildResources, activity: botActivity },
    guildId,
  );
  const inVoice = voice?.reduce((sum, channel) => sum + channel.members, 0) ?? 0;

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Live numbers for this server. Member counts come from Discord and are approximate.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Members"
          value={counts ? numberFormat.format(counts.members) : '—'}
          note={counts ? undefined : 'Discord did not answer'}
        />
        <StatTile
          label="Online now"
          value={counts ? numberFormat.format(counts.online) : '—'}
          note={counts ? undefined : 'Discord did not answer'}
        />
        <StatTile
          label="Active voice channels"
          value={voice ? numberFormat.format(voice.length) : '—'}
          note={voice ? `${numberFormat.format(inVoice)} members in voice` : 'Needs Ririko online'}
        />
        <StatTile
          label="Bot latency"
          value={bot?.online && bot.pingMs !== null ? `${numberFormat.format(bot.pingMs)} ms` : '—'}
          note={bot?.online ? 'Gateway heartbeat' : 'Ririko is offline'}
        />
      </div>

      <Card title={`Commands run, last ${USAGE_DAYS} days`}>
        {usage.total === 0 ? (
          <p className="text-sm text-zinc-400">
            No commands have been run in this server in the last {USAGE_DAYS} days.
          </p>
        ) : (
          <>
            <p className="text-sm text-zinc-400">
              <span className="font-semibold text-zinc-100 tabular-nums">
                {numberFormat.format(usage.total)}
              </span>{' '}
              commands. Days are in UTC.
            </p>
            <div className="mt-3">
              <UsageChart days={usage.days} />
            </div>
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-zinc-400 hover:text-zinc-200">
                Show as a table
              </summary>
              <table className="mt-2 w-full max-w-xs text-left">
                <thead className="text-zinc-400">
                  <tr>
                    <th className="py-1 font-normal">Day (UTC)</th>
                    <th className="py-1 text-right font-normal">Commands</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.days.map((entry) => (
                    <tr key={entry.day} className="border-t border-edge">
                      <td className="py-1">{formatDay(entry.day)}</td>
                      <td className="py-1 text-right tabular-nums">
                        {numberFormat.format(entry.count)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Most used commands">
          {usage.top.length === 0 ? (
            <p className="text-sm text-zinc-400">None yet.</p>
          ) : (
            <ol className="flex flex-col gap-2 text-sm">
              {usage.top.map((command) => (
                <li key={command.commandName} className="flex flex-col gap-1">
                  <div className="flex justify-between gap-3">
                    <span className="font-mono text-zinc-200">{command.commandName}</span>
                    <span className="text-zinc-400 tabular-nums">
                      {numberFormat.format(command.count)}
                    </span>
                  </div>
                  {/* SVG geometry, not a style attribute: the production CSP blocks those. */}
                  <svg
                    viewBox="0 0 100 6"
                    preserveAspectRatio="none"
                    className="h-1.5 w-full"
                    aria-hidden
                  >
                    <rect width="100" height="6" rx="3" className="fill-ink" />
                    <rect
                      width={(command.count / usage.top[0]!.count) * 100}
                      height="6"
                      rx="3"
                      className="fill-sakura-strong"
                    />
                  </svg>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card title="Voice channels in use">
          {voice === null ? (
            <p className="text-sm text-zinc-400">
              Ririko is offline, so voice activity is unknown.
            </p>
          ) : voice.length === 0 ? (
            <p className="text-sm text-zinc-400">Nobody is in a voice channel.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {voice.map((channel) => (
                <li key={channel.channelId} className="flex justify-between gap-3">
                  <span className="truncate text-zinc-200">🔊 {channel.name}</span>
                  <span className="text-zinc-400 tabular-nums">
                    {numberFormat.format(channel.members)}{' '}
                    {channel.members === 1 ? 'member' : 'members'}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-zinc-400">Bots are not counted.</p>
        </Card>
      </div>

      <Card title="Ririko status">
        {bot === null ? (
          <p className="text-sm text-zinc-400">Ririko has not reported its status yet.</p>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
            <dt className="text-zinc-400">Status</dt>
            <dd className={bot.online ? 'text-emerald-300' : 'text-red-300'}>
              {bot.online ? '● Online' : '○ Offline'}
            </dd>
            <dt className="text-zinc-400">{bot.online ? 'Running since' : 'Last seen'}</dt>
            <dd>
              <LocalTime value={bot.online ? bot.startedAt : bot.updatedAt} />
            </dd>
            <dt className="text-zinc-400">Version</dt>
            <dd>v{bot.version}</dd>
          </dl>
        )}
      </Card>
    </section>
  );
}
