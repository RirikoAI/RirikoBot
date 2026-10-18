import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { bossFormValues } from '@ririko/services/dungeon';
import { OwnerNav } from '@/components/owner-nav';
import { requireOwner } from '@/lib/server/auth/session';
import { getWebServices } from '@/lib/server/services';
import { updateDungeonBoss } from '../../../actions';
import { BossForm } from '../../../boss-form';
import { bossTierLabel } from '../../../season-status';

export const metadata: Metadata = { title: 'Edit Boss · Owner Console · Ririko Dashboard' };

export default async function EditDungeonBossPage({
  params,
}: {
  params: Promise<{ seasonId: string; bossKey: string }>;
}) {
  const { seasonId, bossKey } = await params;
  const seasonHref = `/owner/dungeon/${encodeURIComponent(seasonId)}`;
  await requireOwner(`${seasonHref}/bosses/${encodeURIComponent(bossKey)}`);
  const { dungeonSeasons } = await getWebServices();
  const [detail, boss, items] = await Promise.all([
    dungeonSeasons.getSeason(seasonId),
    dungeonSeasons.getBoss(`${seasonId}:${bossKey}`),
    dungeonSeasons.listItems(),
  ]);
  if (!detail || detail.season.isTutorial || !boss) notFound();

  return (
    <section className="flex flex-col gap-6">
      <OwnerNav current="/owner/dungeon" />
      <Link href={seasonHref} className="text-sm text-zinc-400 hover:text-zinc-200">
        ← {detail.season.name}
      </Link>
      <header>
        <h1 className="text-2xl font-bold">{boss.name}</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {boss.animeTitle} · {boss.element} · {bossTierLabel(boss.tier)}
          {boss.title ? ` · ${boss.title}` : ''}
        </p>
        <p className="mt-1 max-w-2xl text-sm text-zinc-400">
          Re-importing the season with <code>pnpm tcg:boss-builder --import-db</code> replaces these
          settings with the boss catalog&apos;s.
        </p>
      </header>
      <BossForm
        action={updateDungeonBoss.bind(null, boss.id)}
        values={bossFormValues(boss)}
        items={items.map((item) => ({
          value: item.code,
          label: `${item.name} (${item.code})`,
          group: item.type,
        }))}
      />
    </section>
  );
}
