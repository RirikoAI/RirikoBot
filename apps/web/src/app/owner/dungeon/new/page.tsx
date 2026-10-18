import type { Metadata } from 'next';
import Link from 'next/link';
import { newSeasonFormValues } from '@ririko/services/dungeon';
import { OwnerNav } from '@/components/owner-nav';
import { requireOwner } from '@/lib/server/auth/session';
import { createDungeonSeason } from '../actions';
import { SeasonForm } from '../season-form';

export const metadata: Metadata = { title: 'New Season · Owner Console · Ririko Dashboard' };

export default async function NewDungeonSeasonPage() {
  await requireOwner('/owner/dungeon/new');

  return (
    <section className="flex flex-col gap-6">
      <OwnerNav current="/owner/dungeon" />
      <Link href="/owner/dungeon" className="text-sm text-zinc-400 hover:text-zinc-200">
        ← Dungeon seasons
      </Link>
      <header>
        <h1 className="text-2xl font-bold">New season</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-400">
          A new season has no bosses: its floors use generated enemies on the curve until bosses are
          imported with <code>pnpm tcg:boss-builder --import-db</code>.
        </p>
      </header>
      <SeasonForm
        action={createDungeonSeason}
        values={newSeasonFormValues()}
        isNew
        submitLabel="Add season"
      />
    </section>
  );
}
