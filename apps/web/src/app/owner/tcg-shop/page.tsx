import type { Metadata } from 'next';
import Link from 'next/link';
import { OwnerNav } from '@/components/owner-nav';
import { requireOwner } from '@/lib/server/auth/session';
import { getWebServices } from '@/lib/server/services';

export const metadata: Metadata = { title: 'TCG Items · Owner Console · Ririko Dashboard' };

export default async function OwnerTcgShopPage() {
  await requireOwner('/owner/tcg-shop');
  const { tcgItems } = await getWebServices();
  const items = await tcgItems.listItems();

  return (
    <section className="flex flex-col gap-8">
      <OwnerNav current="/owner/tcg-shop" />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Waifu TCG items</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-400">
            Gear, potions and materials of the Town Shop (<code>/game action:shop</code>) on every
            server. The bot resets built-in items when it starts, so only their price, purchase
            limit and sale status can change here, and those changes are kept. Custom gear is fully
            editable.
          </p>
        </div>
        <Link
          href="/owner/tcg-shop/new"
          className="rounded-md bg-sakura-strong px-4 py-2 text-sm font-semibold text-white hover:bg-sakura"
        >
          New custom gear
        </Link>
      </header>

      {items.length === 0 ? (
        <p className="text-sm text-zinc-400">
          No items yet. The bot adds the built-in catalog when it starts.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead className="border-b border-edge text-xs text-zinc-400 uppercase">
              <tr>
                <th className="py-2 pr-4 font-medium">Item</th>
                <th className="py-2 pr-4 font-medium">Slot</th>
                <th className="py-2 pr-4 font-medium">Rarity</th>
                <th className="py-2 pr-4 text-right font-medium">Price</th>
                <th className="py-2 pr-4 text-right font-medium">Holders</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map(({ item, holders, canonical }) => (
                <tr key={item.id} className="border-b border-edge/60">
                  <td className="py-2 pr-4">
                    <Link
                      href={`/owner/tcg-shop/${item.id}`}
                      className="font-medium hover:text-sakura"
                    >
                      {item.name}
                    </Link>
                    <p className="font-mono text-xs text-zinc-500">
                      {item.code}
                      {canonical ? '' : ' · custom'}
                      {item.ownerOverridden ? ' · shop edited' : ''}
                    </p>
                  </td>
                  <td className="py-2 pr-4 text-zinc-300">{item.subtype}</td>
                  <td className="py-2 pr-4 text-zinc-300">{item.rarity}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">
                    {Number(item.shopPrice).toLocaleString('en-US')}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums">{holders}</td>
                  <td className="py-2">
                    {item.isShopBuyable ? (
                      <span className="text-emerald-300">On sale</span>
                    ) : (
                      <span className="text-zinc-400">Not sold</span>
                    )}
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
