import type { Metadata } from 'next';
import { LocalTime } from '@/components/local-time';
import { ActionButtonForm } from '@/components/settings-form';
import { MAX_REROLL_WINNERS, type GiveawayView } from '@/lib/server/guilds/giveaways';
import { requireGuildAccess } from '@/lib/server/guilds/require-guild-access';
import type { UserSummary } from '@/lib/server/guilds/user-directory';
import { getWebServices } from '@/lib/server/services';
import { endGiveaway, rerollGiveaway } from './actions';

export const metadata: Metadata = { title: 'Giveaways · Ririko Dashboard' };

export default async function GiveawaysPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const { giveaways, userDirectory } = await getWebServices();
  const { active, ended } = await giveaways.list(guildId);
  const users = await userDirectory.lookup(
    [...active, ...ended].flatMap((giveaway) => [
      giveaway.createdBy,
      ...giveaway.winners.map((winner) => winner.userId),
    ]),
  );

  return (
    <section className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-bold">Giveaways</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Start giveaways in Discord with <code>/giveaway create</code>. Here you can end them early
          and draw new winners. Winners are drawn exactly as the command draws them, and Ririko
          announces them in the giveaway’s channel.
        </p>
      </header>

      <section aria-labelledby="active-heading" className="flex flex-col gap-3">
        <h2 id="active-heading" className="text-lg font-semibold">
          Running
        </h2>
        {active.length === 0 ? (
          <p className="text-sm text-zinc-400">No giveaway is running.</p>
        ) : (
          <ul className="flex max-w-3xl flex-col gap-3">
            {active.map((giveaway) => (
              <GiveawayCard key={giveaway.id} giveaway={giveaway} users={users}>
                <ActionButtonForm
                  action={endGiveaway.bind(null, guildId)}
                  fields={{ giveawayId: giveaway.id }}
                  label="End now"
                  confirmMessage={`End the giveaway for ${giveaway.prize} now and draw its winners?`}
                />
              </GiveawayCard>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="ended-heading" className="flex flex-col gap-3">
        <h2 id="ended-heading" className="text-lg font-semibold">
          Ended
        </h2>
        {ended.length === 0 ? (
          <p className="text-sm text-zinc-400">No giveaway has ended yet.</p>
        ) : (
          <ul className="flex max-w-3xl flex-col gap-3">
            {ended.map((giveaway) => (
              <GiveawayCard key={giveaway.id} giveaway={giveaway} users={users}>
                <ActionButtonForm
                  action={rerollGiveaway.bind(null, guildId)}
                  fields={{ giveawayId: giveaway.id }}
                  label="Reroll"
                  confirmMessage={`Draw new winners for ${giveaway.prize}? Earlier winners keep their win and cannot be drawn again.`}
                >
                  <label className="flex items-center gap-2 text-xs text-zinc-400">
                    Winners
                    <input
                      type="number"
                      name="count"
                      min={1}
                      max={MAX_REROLL_WINNERS}
                      step={1}
                      placeholder={String(giveaway.winnerCount)}
                      className="w-16 rounded-md border border-edge bg-transparent px-2 py-1 text-sm text-zinc-100"
                    />
                  </label>
                </ActionButtonForm>
              </GiveawayCard>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

function userName(users: Map<string, UserSummary>, id: string): string {
  return users.get(id)?.name ?? id;
}

function GiveawayCard({
  giveaway,
  users,
  children,
}: {
  giveaway: GiveawayView;
  users: Map<string, UserSummary>;
  children: React.ReactNode;
}) {
  const firstDraw = giveaway.winners.filter((winner) => !winner.isReroll);
  const rerolls = giveaway.winners.filter((winner) => winner.isReroll);
  return (
    <li className="flex flex-col gap-2 rounded-md border border-edge p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-semibold text-zinc-100">{giveaway.prize}</span>
        <span className="text-sm text-zinc-400">
          {giveaway.channelName ? `#${giveaway.channelName}` : 'Deleted channel'}
        </span>
        {giveaway.messageUrl ? (
          <a
            href={giveaway.messageUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-sakura underline"
          >
            Open in Discord
          </a>
        ) : null}
      </div>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm text-zinc-300">
        <dt className="text-zinc-400">{giveaway.isEnded ? 'Ended' : 'Ends'}</dt>
        <dd>
          <LocalTime value={giveaway.endsAt.toISOString()} />
        </dd>
        <dt className="text-zinc-400">Entries</dt>
        <dd>{giveaway.entryCount}</dd>
        <dt className="text-zinc-400">Winners</dt>
        <dd>
          {giveaway.isEnded
            ? firstDraw.length > 0
              ? firstDraw.map((winner) => userName(users, winner.userId)).join(', ')
              : 'Nobody (no eligible entries)'
            : giveaway.winnerCount}
        </dd>
        {rerolls.length > 0 ? (
          <>
            <dt className="text-zinc-400">Rerolled</dt>
            <dd>{rerolls.map((winner) => userName(users, winner.userId)).join(', ')}</dd>
          </>
        ) : null}
        <dt className="text-zinc-400">Host</dt>
        <dd>{userName(users, giveaway.createdBy)}</dd>
      </dl>
      {children}
    </li>
  );
}
