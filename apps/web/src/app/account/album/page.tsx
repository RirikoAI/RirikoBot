import type { Metadata } from 'next';
import Link from 'next/link';
import { ALBUM_RARITIES, parseAlbumQuery, type AlbumQuery } from '@ririko/services/tcg-album';
import { AccountNav } from '@/components/account-nav';
import { SiteHeader } from '@/components/site-header';
import { numberFormat } from '@/lib/chart-format';
import { requireSession } from '@/lib/server/auth/session';
import { getWebServices } from '@/lib/server/services';
import { AlbumCardImage } from './card-image';

export const metadata: Metadata = { title: 'Card Album · Ririko Dashboard' };

const BASE = '/account/album';
/** The owner-only route that serves each card's image (app/api/album/cards/[userCardId]). */
const CARD_IMAGES = '/api/album/cards';
const INPUT =
  'rounded-md border border-edge bg-ink px-3 py-2 text-sm text-zinc-100 focus-visible:outline-2 focus-visible:outline-sakura';

const STATE_LABELS: Record<string, string> = {
  EQUIPPED: 'Vanguard',
  IN_TRADE: 'In a trade',
  IN_MARKET: 'Listed on the market',
};

function albumHref(query: AlbumQuery): string {
  const params = new URLSearchParams();
  if (query.favoritesOnly) params.set('favorites', '1');
  if (query.rarity) params.set('rarity', query.rarity);
  if (query.page > 1) params.set('page', String(query.page));
  const search = params.toString();
  return search ? `${BASE}?${search}` : BASE;
}

/** The signed-in user's own Waifu TCG cards, drawn as the bot draws them. */
export default async function AlbumPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession(BASE);
  const query = parseAlbumQuery(await searchParams);
  const { cardAlbum } = await getWebServices();
  const album = await cardAlbum.page(session.userId, query);
  const hasFilters = query.favoritesOnly || query.rarity !== null;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
        <Link href="/servers" className="text-sm text-zinc-400 hover:text-zinc-200">
          ← Your servers
        </Link>
        <AccountNav current={BASE} />
        <header>
          <h1 className="text-2xl font-bold">Card Album</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Every Waifu TCG card you own, newest first. Use <code>/cards</code> in Discord to equip,
            favourite, trade or dismantle them.
          </p>
        </header>

        <form method="get" action={BASE} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Rarity</span>
            <select name="rarity" defaultValue={query.rarity ?? ''} className={INPUT}>
              <option value="">Any rarity</option>
              {ALBUM_RARITIES.map((rarity) => (
                <option key={rarity} value={rarity}>
                  {rarity.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 py-2 text-sm">
            <input
              type="checkbox"
              name="favorites"
              value="1"
              defaultChecked={query.favoritesOnly}
              className="accent-sakura"
            />
            Favourites only
          </label>
          <button
            type="submit"
            className="rounded-md bg-sakura-strong px-4 py-2 text-sm font-semibold text-white hover:bg-sakura"
          >
            Filter
          </button>
          {hasFilters ? (
            <Link href={BASE} className="py-2 text-sm text-zinc-400 hover:text-zinc-200">
              Clear filters
            </Link>
          ) : null}
        </form>

        <p className="text-sm text-zinc-400">
          {numberFormat.format(album.total)} {album.total === 1 ? 'card' : 'cards'}
          {hasFilters ? ' match these filters' : ''}.
        </p>

        {album.cards.length === 0 ? (
          <p className="rounded-md border border-edge p-4 text-sm text-zinc-400">
            {hasFilters
              ? 'No cards match these filters.'
              : 'You do not own any cards yet. Claim a card drop in a server with Ririko to start your collection.'}
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {album.cards.map((card) => (
              <li key={card.id} className="flex flex-col gap-2 rounded-md border border-edge p-2">
                <AlbumCardImage
                  src={`${CARD_IMAGES}/${encodeURIComponent(card.id)}`}
                  alt={`${card.name}, ${card.rarityName} ${card.element.toLowerCase()} card`}
                />
                <div className="text-sm">
                  <p className="font-medium">
                    {card.isFavorite ? <span aria-label="Favourite">★ </span> : null}
                    {card.name}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {card.rarityName} · {card.element} · Lv. {card.level}
                  </p>
                  <p className="text-xs text-zinc-500">
                    No. {String(card.collectionNumber).padStart(3, '0')} · Mint #{card.serialNumber}
                    {STATE_LABELS[card.state] ? ` · ${STATE_LABELS[card.state]}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}

        {album.totalPages > 1 ? (
          <nav aria-label="Album pages" className="flex items-center justify-between text-sm">
            {album.page > 1 ? (
              <Link
                href={albumHref({ ...album.query, page: album.page - 1 })}
                className="text-sakura hover:underline"
              >
                ← Newer
              </Link>
            ) : (
              <span />
            )}
            <span className="text-zinc-400">
              Page {album.page} of {album.totalPages}
            </span>
            {album.page < album.totalPages ? (
              <Link
                href={albumHref({ ...album.query, page: album.page + 1 })}
                className="text-sakura hover:underline"
              >
                Older →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </main>
    </>
  );
}
