import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { TcgGearStat } from '@ririko/core';
import { OwnerNav } from '@/components/owner-nav';
import { ActionButtonForm } from '@/components/settings-form';
import { requireOwner } from '@/lib/server/auth/session';
import { getWebServices } from '@/lib/server/services';
import { deleteTcgGear, saveTcgItemShopFields, updateTcgGear } from '../actions';
import { GearForm, ShopFieldsForm } from '../item-forms';

export const metadata: Metadata = { title: 'Edit TCG Item · Owner Console · Ririko Dashboard' };

export default async function EditTcgItemPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  await requireOwner(`/owner/tcg-shop/${encodeURIComponent(itemId)}`);
  const { tcgItems } = await getWebServices();
  const view = await tcgItems.getItem(itemId);
  if (!view) notFound();
  const { item, holders, canonical } = view;
  const shop = {
    isShopBuyable: item.isShopBuyable,
    shopPrice: Number(item.shopPrice),
    maxDailyPurchases: item.maxDailyPurchases,
  };
  const stats = Object.entries(item.baseStats ?? {});

  return (
    <section className="flex flex-col gap-6">
      <OwnerNav current="/owner/tcg-shop" />
      <Link href="/owner/tcg-shop" className="text-sm text-zinc-400 hover:text-zinc-200">
        ← Waifu TCG items
      </Link>
      <header>
        <h1 className="text-2xl font-bold">{item.name}</h1>
        <p className="mt-1 font-mono text-xs text-zinc-500">{item.code}</p>
        <p className="mt-2 text-sm text-zinc-400">
          {holders === 1 ? '1 player holds' : `${holders} players hold`} this item.
        </p>
      </header>

      {canonical ? (
        <>
          <dl className="grid max-w-2xl grid-cols-2 gap-x-6 gap-y-1 rounded-md border border-edge p-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-zinc-500">Type</dt>
              <dd>
                {item.type} · {item.subtype}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Rarity</dt>
              <dd>{item.rarity}</dd>
            </div>
            {stats.map(([stat, value]) => (
              <div key={stat}>
                <dt className="text-xs text-zinc-500">{stat}</dt>
                <dd className="tabular-nums">{value}</dd>
              </div>
            ))}
            {(item.battlePerks ?? []).length > 0 ? (
              <div>
                <dt className="text-xs text-zinc-500">Perks</dt>
                <dd>{(item.battlePerks ?? []).join(', ')}</dd>
              </div>
            ) : null}
          </dl>
          <p className="max-w-2xl text-sm text-zinc-400">
            A built-in item: the bot resets its stats and text from the catalog when it starts.
            Price, purchase limit and sale status saved here are kept.
          </p>
          <ShopFieldsForm action={saveTcgItemShopFields.bind(null, item.id)} values={shop} />
        </>
      ) : (
        <>
          <GearForm
            action={updateTcgGear.bind(null, item.id)}
            values={{
              ...shop,
              code: item.code,
              name: item.name,
              description: item.description,
              subtype: item.subtype,
              rarity: item.rarity,
              battlePerks: item.battlePerks ?? [],
              isTradeable: item.isTradeable,
              stats: (item.baseStats ?? {}) as Partial<Record<TcgGearStat, number>>,
            }}
            codeLocked
            submitLabel="Save item"
          />
          {!item.isShopBuyable && holders === 0 ? (
            <div className="border-t border-edge pt-4">
              <ActionButtonForm
                action={deleteTcgGear}
                fields={{ itemId: item.id }}
                label="Delete item"
                confirmMessage={`Delete ${item.name} for good? This cannot be undone.`}
              />
            </div>
          ) : (
            <p className="border-t border-edge pt-4 text-xs text-zinc-500">
              To delete this item, stop selling it first. Items players hold cannot be deleted.
            </p>
          )}
        </>
      )}
    </section>
  );
}
