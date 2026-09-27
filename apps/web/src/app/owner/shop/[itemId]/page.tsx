import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { shopItemEffectValues } from '@ririko/core';
import { OwnerNav } from '@/components/owner-nav';
import { ActionButtonForm } from '@/components/settings-form';
import { requireOwner } from '@/lib/server/auth/session';
import { getWebServices } from '@/lib/server/services';
import { deleteShopItem, setShopItemPurchasable, updateShopItem } from '../actions';
import { ItemForm } from '../item-form';

export const metadata: Metadata = { title: 'Edit Item · Owner Console · Ririko Dashboard' };

export default async function EditShopItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  await requireOwner(`/owner/shop/${encodeURIComponent(itemId)}`);
  const { itemCatalog } = await getWebServices();
  const [view, categories] = await Promise.all([
    itemCatalog.getItem(itemId),
    itemCatalog.listCategories(),
  ]);
  if (!view) notFound();
  const { item, holders, seeded } = view;

  return (
    <section className="flex flex-col gap-6">
      <OwnerNav current="/owner/shop" />
      <Link href="/owner/shop" className="text-sm text-zinc-400 hover:text-zinc-200">
        ← Item shop
      </Link>
      <header>
        <h1 className="text-2xl font-bold">{item.name}</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {holders === 1 ? '1 member holds' : `${holders} members hold`} this item.
          {seeded
            ? ' It is part of the default catalog, so it can be retired but not deleted.'
            : ''}
        </p>
      </header>
      <ItemForm
        action={updateShopItem.bind(null, item.id)}
        values={{
          ...shopItemEffectValues(item.metadata),
          code: item.code ?? '',
          name: item.name,
          description: item.description,
          price: Number(item.price),
          rarity: item.rarity,
          categoryId: item.categoryId,
          iconUrl: item.iconUrl,
          isPurchasable: item.isPurchasable,
        }}
        categories={categories.map(({ category }) => category)}
        codeLocked={item.code !== null}
        submitLabel="Save item"
      />
      <div className="flex flex-wrap items-center gap-4 border-t border-edge pt-4">
        <ActionButtonForm
          action={setShopItemPurchasable}
          fields={{ itemId: item.id, purchasable: String(!item.isPurchasable) }}
          label={item.isPurchasable ? 'Retire item' : 'Put back on sale'}
          {...(item.isPurchasable
            ? { confirmMessage: `Stop selling ${item.name}? Members keep the ones they have.` }
            : {})}
        />
        {!item.isPurchasable && holders === 0 && !seeded ? (
          <ActionButtonForm
            action={deleteShopItem}
            fields={{ itemId: item.id }}
            label="Delete item"
            confirmMessage={`Delete ${item.name} for good? This cannot be undone.`}
          />
        ) : null}
      </div>
    </section>
  );
}
