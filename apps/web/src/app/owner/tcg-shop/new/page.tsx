import type { Metadata } from 'next';
import Link from 'next/link';
import { OwnerNav } from '@/components/owner-nav';
import { requireOwner } from '@/lib/server/auth/session';
import { createTcgGear } from '../actions';
import { GearForm, NEW_GEAR_VALUES } from '../item-forms';

export const metadata: Metadata = { title: 'New TCG Gear · Owner Console · Ririko Dashboard' };

export default async function NewTcgGearPage() {
  await requireOwner('/owner/tcg-shop/new');

  return (
    <section className="flex flex-col gap-6">
      <OwnerNav current="/owner/tcg-shop" />
      <Link href="/owner/tcg-shop" className="text-sm text-zinc-400 hover:text-zinc-200">
        ← Waifu TCG items
      </Link>
      <h1 className="text-2xl font-bold">New custom gear</h1>
      <GearForm
        action={createTcgGear}
        values={NEW_GEAR_VALUES}
        codeLocked={false}
        submitLabel="Add gear"
      />
    </section>
  );
}
