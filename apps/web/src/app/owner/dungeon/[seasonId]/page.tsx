import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  parseFloorLineup,
  parseFloorLoot,
  seasonCurvePoints,
  seasonFormValues,
} from '@ririko/services/dungeon';
import type { DungeonFloor } from '@ririko/database';
import { OwnerNav } from '@/components/owner-nav';
import { requireOwner } from '@/lib/server/auth/session';
import { getWebServices } from '@/lib/server/services';
import { updateDungeonSeason } from '../actions';
import { CurveChart } from '../curve-chart';
import { SeasonForm } from '../season-form';
import { bossTierLabel, SeasonStatusLabel } from '../season-status';

export const metadata: Metadata = { title: 'Edit Season · Owner Console · Ririko Dashboard' };

/** The chart shows at least this many floors, so a season without floor rows still has a curve. */
const MIN_CHART_FLOORS = 50;

export default async function EditDungeonSeasonPage({
  params,
}: {
  params: Promise<{ seasonId: string }>;
}) {
  const { seasonId } = await params;
  await requireOwner(`/owner/dungeon/${encodeURIComponent(seasonId)}`);
  const { dungeonSeasons } = await getWebServices();
  const detail = await dungeonSeasons.getSeason(seasonId);
  if (!detail || detail.season.isTutorial) notFound();
  const { season, status, floorRows, bossRows } = detail;

  const lastFloor = Math.max(MIN_CHART_FLOORS, ...floorRows.map((f) => f.floorNumber));
  const points = seasonCurvePoints(season, lastFloor);
  const bossesById = new Map(bossRows.map((boss) => [boss.id, boss]));
  const seasonHref = `/owner/dungeon/${encodeURIComponent(season.id)}`;
  const bossHref = (key: string) => `${seasonHref}/bosses/${encodeURIComponent(key)}`;

  return (
    <section className="flex flex-col gap-8">
      <OwnerNav current="/owner/dungeon" />
      <Link href="/owner/dungeon" className="text-sm text-zinc-400 hover:text-zinc-200">
        ← Dungeon seasons
      </Link>
      <header>
        <h1 className="text-2xl font-bold">{season.name}</h1>
        <p className="mt-1 text-sm text-zinc-400">
          <span className="font-mono">{season.id}</span> · <SeasonStatusLabel status={status} />
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Difficulty curve</h2>
        <p className="max-w-2xl text-sm text-zinc-400">
          Enemy stats per floor from the saved curve, before each boss&apos;s own multipliers. Save
          the form to update it.
        </p>
        <CurveChart points={points} />
      </div>

      <SeasonForm
        action={updateDungeonSeason.bind(null, season.id)}
        values={seasonFormValues(season)}
        isNew={false}
        submitLabel="Save season"
      />

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Floors</h2>
        {floorRows.length === 0 ? (
          <p className="text-sm text-zinc-400">
            No floor rows: every floor uses a generated enemy on the curve.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="border-b border-edge text-xs text-zinc-400 uppercase">
                <tr>
                  <th className="py-2 pr-4 font-medium">Floor</th>
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">Boss</th>
                  <th className="py-2 pr-4 text-right font-medium">Energy</th>
                  <th className="py-2 font-medium">Loot</th>
                </tr>
              </thead>
              <tbody>
                {floorRows.map((floor) => {
                  const boss = bossesById.get(parseFloorLineup(floor.enemyLineup)?.bossId ?? '');
                  return (
                    <tr key={floor.id} className="border-b border-edge/60">
                      <td className="py-2 pr-4 tabular-nums">{floor.floorNumber}</td>
                      <td className="py-2 pr-4 text-zinc-300">{floor.name}</td>
                      <td className="py-2 pr-4">
                        {boss ? (
                          <Link href={bossHref(boss.key)} className="hover:text-sakura">
                            {boss.name}
                          </Link>
                        ) : (
                          <span className="text-zinc-500">Generated</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">{floor.energyCost}</td>
                      <td className="py-2">
                        <Link
                          href={`${seasonHref}/floors/${floor.floorNumber}`}
                          className="hover:text-sakura"
                        >
                          {hasLootTable(floor) ? 'Custom' : 'Default'}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Bosses</h2>
        {bossRows.length === 0 ? (
          <p className="text-sm text-zinc-400">
            No bosses. Import them with <code>pnpm tcg:boss-builder --import-db</code>.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {bossRows.map((boss) => (
              <li key={boss.id} className="rounded-md border border-edge bg-panel px-3 py-2">
                <Link href={bossHref(boss.key)} className="font-medium hover:text-sakura">
                  {boss.name}
                </Link>
                <p className="text-xs text-zinc-400">
                  {boss.animeTitle} · {boss.element} · {bossTierLabel(boss.tier)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function hasLootTable(floor: DungeonFloor): boolean {
  const { firstClear, repeat } = parseFloorLoot(floor);
  return Object.keys(firstClear).length > 0 || Object.keys(repeat).length > 0;
}
