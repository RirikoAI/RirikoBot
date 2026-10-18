import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { floorLootFormValues } from '@ririko/services/dungeon';
import { OwnerNav } from '@/components/owner-nav';
import { requireOwner } from '@/lib/server/auth/session';
import { getWebServices } from '@/lib/server/services';
import { updateDungeonFloorLoot } from '../../../actions';
import { LootForm } from '../../../loot-form';

export const metadata: Metadata = { title: 'Floor Loot · Owner Console · Ririko Dashboard' };

export default async function EditDungeonFloorLootPage({
  params,
}: {
  params: Promise<{ seasonId: string; floorNumber: string }>;
}) {
  const { seasonId, floorNumber: floorParam } = await params;
  const seasonHref = `/owner/dungeon/${encodeURIComponent(seasonId)}`;
  await requireOwner(`${seasonHref}/floors/${encodeURIComponent(floorParam)}`);
  const floorNumber = Number(floorParam);
  if (!Number.isInteger(floorNumber) || floorNumber < 1) notFound();
  const { dungeonSeasons } = await getWebServices();
  const [detail, floor, items] = await Promise.all([
    dungeonSeasons.getSeason(seasonId),
    dungeonSeasons.getFloor(seasonId, floorNumber),
    dungeonSeasons.listItems(),
  ]);
  if (!detail || detail.season.isTutorial || !floor) notFound();

  return (
    <section className="flex flex-col gap-6">
      <OwnerNav current="/owner/dungeon" />
      <Link href={seasonHref} className="text-sm text-zinc-400 hover:text-zinc-200">
        ← {detail.season.name}
      </Link>
      <header>
        <h1 className="text-2xl font-bold">
          Floor {floor.floorNumber} loot: {floor.name}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-400">
          Rewards for clearing this floor. Empty fields keep the default loot, so a floor with
          nothing set here plays exactly as before. Re-importing the season keeps this loot.
        </p>
      </header>
      <LootForm
        action={updateDungeonFloorLoot.bind(null, seasonId, floor.floorNumber)}
        values={floorLootFormValues(floor)}
        floorNumber={floor.floorNumber}
        items={items.map((item) => ({
          value: item.code,
          label: `${item.name} (${item.code})`,
          group: item.type,
        }))}
      />
    </section>
  );
}
