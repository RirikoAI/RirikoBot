import type { Metadata } from 'next';
import Link from 'next/link';
import { OwnerNav } from '@/components/owner-nav';
import { requireOwner } from '@/lib/server/auth/session';
import { getWebServices } from '@/lib/server/services';
import { createShopItem } from '../actions';
import { ItemForm, NEW_ITEM_VALUES } from '../item-form';

export const metadata: Metadata = { title: 'New Item · Owner Console · Ririko Dashboard' };

export default async function NewShopItemPage() {
  await requireOwner('/owner/shop/new');
  const { itemCatalog } = await getWebServices();
  const categories = await itemCatalog.listCategories();

  return (
    <section className="flex flex-col gap-6">
      <OwnerNav current="/owner/shop" />
      <Link href="/owner/shop" className="text-sm text-zinc-400 hover:text-zinc-200">
        ← Item shop
      </Link>
      <h1 className="text-2xl font-bold">New item</h1>
      <ItemForm
        action={createShopItem}
        values={NEW_ITEM_VALUES}
        categories={categories.map(({ category }) => category)}
        codeLocked={false}
        submitLabel="Add item"
      />
    </section>
  );
}
