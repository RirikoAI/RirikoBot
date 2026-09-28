import type { Metadata } from 'next';
import Link from 'next/link';
import { OwnerNav } from '@/components/owner-nav';
import { requireOwner } from '@/lib/server/auth/session';
import { getWebServices } from '@/lib/server/services';
import { SeasonStatusLabel } from './season-status';

export const metadata: Metadata = { title: 'Dungeon · Owner Console · Ririko Dashboard' };

const dayFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });

export default async function OwnerDungeonPage() {
  await requireOwner('/owner/dungeon');
  const { dungeonSeasons } = await getWebServices();
  const seasons = await dungeonSeasons.listSeasons();

  return (
    <section className="flex flex-col gap-8">
      <OwnerNav current="/owner/dungeon" />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dungeon seasons</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            The /dungeon tower on every server. Players climb the live season; a queued season takes
            over on its start date. Re-importing a season with{' '}
            <code>pnpm tcg:boss-builder --import-db</code> replaces its name, theme and curve but
            keeps the schedule set here.
          </p>
        </div>
        <Link
          href="/owner/dungeon/new"
          className="rounded-md bg-sakura-strong px-4 py-2 text-sm font-semibold text-white hover:bg-sakura"
        >
          New season
        </Link>
      </header>

      {seasons.length === 0 ? (
        <p className="text-sm text-zinc-400">
          No seasons yet. The bot creates Season 1 when it starts.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-edge text-xs text-zinc-400 uppercase">
              <tr>
                <th className="py-2 pr-4 font-medium">Season</th>
                <th className="py-2 pr-4 font-medium">Dates (UTC)</th>
                <th className="py-2 pr-4 font-medium">Curve</th>
                <th className="py-2 pr-4 text-right font-medium">Floors</th>
                <th className="py-2 pr-4 text-right font-medium">Bosses</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {seasons.map(({ season, status, floors, bosses }) => (
                <tr key={season.id} className="border-b border-edge/60">
                  <td className="py-2 pr-4">
                    {season.isTutorial ? (
                      <span className="font-medium">{season.name}</span>
                    ) : (
                      <Link
                        href={`/owner/dungeon/${season.id}`}
                        className="font-medium hover:text-sakura"
                      >
                        {season.name}
                      </Link>
                    )}
                    <p className="font-mono text-xs text-zinc-500">{season.id}</p>
                  </td>
                  <td className="py-2 pr-4 text-zinc-300">
                    {dayFormat.format(season.startsAt)} – {dayFormat.format(season.endsAt)}
                  </td>
                  <td className="py-2 pr-4 text-zinc-300">{season.scalingModel}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{floors}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{bosses}</td>
                  <td className="py-2">
                    <SeasonStatusLabel status={status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
