import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { RateLimiter, fetchWithRetry } from '../catalog/rate-limiter.js';
import { AniListClient } from '../catalog/anilist.client.js';
import { DanbooruClient, danbooruTagVariants } from '../catalog/danbooru.client.js';
import {
  loadCatalog,
  loadManifest,
  matchCatalogCharacter,
  pickCharacters,
  pickStarterCharacters,
  saveManifest,
  slugifyCharacterKey,
  type CardManifest,
  type CardManifestCard,
  type CatalogCharacter,
} from '../catalog/card-catalog.js';
import { syncCatalogCharacter } from '../catalog/catalog-sync.js';
import type { CardElement, CardRarity } from '../types.js';

const noSleep = () => Promise.resolve();
const instantLimiter = () => new RateLimiter(0, { sleep: noSleep });

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function character(key: string, element: CardElement, favourites = 0): CatalogCharacter {
  return { key, name: key, anime: 'Test', element, tags: [], favourites };
}

function manifestCard(
  characterKey: string,
  rarity: CardRarity,
  isStarter = false,
): CardManifestCard {
  return {
    id: `card_${characterKey}_${rarity}`,
    characterKey,
    name: characterKey,
    animeTitle: 'Test',
    element: 'FIRE',
    rarity,
    stats: { hp: 1, attack: 1, defense: 1, speed: 1, critRate: 0.05 },
    skill: { name: 's', description: 'd', mpCost: 1 },
    passive: { name: 'p', description: 'd' },
    collectionNumber: 1,
    isStarter,
    textScale: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

const emptyManifest = (): CardManifest => ({ version: 1, assets: {}, cards: [] });

describe('RateLimiter & fetchWithRetry', () => {
  it('spaces task starts by the minimum interval', async () => {
    let clock = 0;
    const sleeps: number[] = [];
    const limiter = new RateLimiter(1000, {
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
    });
    const starts: number[] = [];
    await Promise.all([1, 2, 3].map(() => limiter.schedule(async () => void starts.push(clock))));
    expect(starts).toEqual([0, 1000, 2000]);
    expect(sleeps).toEqual([1000, 1000]);
  });

  it('keeps working after a task throws', async () => {
    const limiter = instantLimiter();
    await expect(limiter.schedule(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(limiter.schedule(async () => 'ok')).resolves.toBe('ok');
  });

  it('retries 429 using Retry-After and 5xx with backoff, then returns success', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '3' } }))
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const sleeps: number[] = [];
    const res = await fetchWithRetry(
      'https://x',
      {},
      {
        limiter: instantLimiter(),
        fetchFn,
        baseBackoffMs: 100,
        sleep: async (ms) => void sleeps.push(ms),
      },
    );
    expect(res.status).toBe(200);
    expect(sleeps).toEqual([3000, 200]);
  });

  it('does not retry client errors', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 404 }));
    const res = await fetchWithRetry(
      'https://x',
      {},
      { limiter: instantLimiter(), fetchFn, sleep: noSleep },
    );
    expect(res.status).toBe(404);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe('AniListClient', () => {
  const page = (characters: unknown[]) => jsonResponse({ data: { Page: { characters } } });
  const aniChar = (id: number, name: string, titles: string[], favourites = 10) => ({
    id,
    name: { full: name },
    image: { large: `https://img/${id}.png` },
    favourites,
    media: { nodes: titles.map((t) => ({ title: { romaji: t, english: null } })) },
  });

  it('prefers the result whose media matches the anime title', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        page([aniChar(1, 'Lucy', ['Fairy Tail']), aniChar(2, 'Lucy', ['Elfen Lied'], 50)]),
      );
    const client = new AniListClient({ limiter: instantLimiter(), fetchFn });
    const found = await client.findCharacter('Lucy', 'Elfen Lied');
    expect(found).toMatchObject({ id: 2, favourites: 50, imageUrl: 'https://img/2.png' });
  });

  it('falls back to the first result and returns null on no results', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(page([aniChar(7, 'Rem', ['Something Else'])]))
      .mockResolvedValueOnce(page([]));
    const client = new AniListClient({ limiter: instantLimiter(), fetchFn });
    expect((await client.findCharacter('Rem', 'Re:Zero'))?.id).toBe(7);
    expect(await client.findCharacter('Nobody')).toBeNull();
  });
});

describe('DanbooruClient', () => {
  it('builds full, reversed and first-name tag variants', () => {
    expect(danbooruTagVariants('Rukia Kuchiki (Sode no Shirayuki)')).toEqual([
      'rukia_kuchiki',
      'kuchiki_rukia',
      'rukia',
    ]);
    expect(danbooruTagVariants('Holo')).toEqual(['holo']);
  });

  it('resolves tags by series qualifier, alias, and rejects ambiguous first-name matches', async () => {
    const tagsFor: Record<string, unknown[]> = {
      'rem*': [
        { name: 'rem_(re:zero)', post_count: 9000 },
        { name: 'rem_(other)', post_count: 100 },
      ],
      'soi_fon*': [
        { name: 'sui-feng', post_count: 997 },
        { name: 'soi_fon', post_count: 0 },
      ],
      'fon_soi*': [],
      'soi*': [{ name: 'soi_(unrelated)', post_count: 3 }],
    };
    const fetchFn = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      return jsonResponse(tagsFor[url.searchParams.get('search[name_or_alias_matches]')!] ?? []);
    });
    const client = new DanbooruClient({ limiter: instantLimiter(), fetchFn });

    expect(await client.resolveCharacterTag('Rem', 'Re:Zero')).toBe('rem_(re:zero)');
    expect(await client.resolveCharacterTag('Soi Fon', 'Bleach')).toBe('sui-feng');

    tagsFor['soi_fon*'] = [];
    expect(await client.resolveCharacterTag('Soi Fon', 'Bleach')).toBeNull();
  });

  it('tries every spelling before first-name fallbacks and rejects aliases from other series', async () => {
    const tagsFor: Record<string, unknown[]> = {
      'asuna_yuuki*': [{ name: 'yuuki_asuna_(nozokima_2)', post_count: 50 }],
      'ryuko_matoi*': [],
      'matoi_ryuko*': [],
      'ryuuko_matoi*': [],
      'matoi_ryuuko*': [{ name: 'matoi_ryuuko', post_count: 8000 }],
    };
    const queried: string[] = [];
    const fetchFn = vi.fn<typeof fetch>(async (input) => {
      const q = new URL(String(input)).searchParams.get('search[name_or_alias_matches]')!;
      queried.push(q);
      return jsonResponse(tagsFor[q] ?? []);
    });
    const client = new DanbooruClient({ limiter: instantLimiter(), fetchFn });

    expect(
      await client.resolveCharacterTag(['Ryuko Matoi', 'Ryuuko Matoi'], ['Kill la Kill']),
    ).toBe('matoi_ryuuko');
    expect(queried).toEqual(['ryuko_matoi*', 'matoi_ryuko*', 'ryuuko_matoi*', 'matoi_ryuuko*']);

    expect(await client.resolveCharacterTag('Asuna Yuuki', 'Sword Art Online')).toBeNull();
  });

  it('picks a safe, solo, portrait post and skips others', async () => {
    const post = (id: number, over: Record<string, unknown> = {}) => ({
      id,
      rating: 'g',
      file_ext: 'jpg',
      image_width: 1000,
      image_height: 1500,
      large_file_url: `https://cdn/${id}.jpg`,
      tag_string_general: '1girl solo smile',
      tag_string_artist: 'artist_x',
      tag_string_character: 'holo',
      ...over,
    });
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse([
          post(1, { rating: 's' }),
          post(2, { tag_string_general: '2girls smile' }),
          post(3, { tag_string_general: '1girl solo comic' }),
          post(4, { image_width: 2000, image_height: 1000 }),
          post(5, { file_ext: 'mp4' }),
          post(7, { tag_string_character: 'holo lawrence_(spice_and_wolf) nora_arent' }),
          post(8, { tag_string_general: '1girl solo character_doll' }),
          post(6),
        ]),
      );
    const client = new DanbooruClient({ limiter: instantLimiter(), fetchFn });
    expect(await client.findPortrait('holo')).toEqual({
      postId: 6,
      imageUrl: 'https://cdn/6.jpg',
      artist: 'artist_x',
      width: 1000,
      height: 1500,
    });
  });
});

describe('card catalog picking', () => {
  it('never picks starter characters and avoids repeats at a rarity until exhausted', () => {
    const catalog = [character('a', 'FIRE'), character('b', 'FIRE'), character('c', 'FIRE')];
    const manifest = emptyManifest();
    manifest.cards.push(manifestCard('c', 'COMMON', true), manifestCard('a', 'RARE'));

    const picked = pickCharacters(catalog, manifest, { rarity: 'RARE', count: 3, random: () => 0 });
    // b first (no RARE yet), then a/b alternate; c is a reserved starter.
    expect(picked.map((c) => c.key)).toEqual(['b', 'a', 'b']);
  });

  it('filters by element and returns nothing when no character matches', () => {
    const catalog = [character('a', 'FIRE'), character('b', 'ICE')];
    expect(
      pickCharacters(catalog, emptyManifest(), { rarity: 'COMMON', count: 2, element: 'ICE' }).map(
        (c) => c.key,
      ),
    ).toEqual(['b', 'b']);
    expect(
      pickCharacters(catalog, emptyManifest(), { rarity: 'COMMON', count: 1, element: 'SHADOW' }),
    ).toEqual([]);
  });

  it('biases high rarities toward popular characters and low rarities away from them', () => {
    const catalog = [character('obscure', 'FIRE', 0), character('famous', 'FIRE', 100_000)];
    const tally = (rarity: CardRarity) => {
      let famous = 0;
      for (let i = 0; i < 200; i++) {
        const [pick] = pickCharacters(catalog, emptyManifest(), {
          rarity,
          count: 1,
          random: () => i / 200,
        });
        if (pick!.key === 'famous') famous++;
      }
      return famous;
    };
    expect(tally('MYTHIC')).toBeGreaterThan(180);
    expect(tally('COMMON')).toBeLessThan(20);
  });

  it('spreads starters across elements and skips characters that already have cards', () => {
    const catalog = [
      character('f1', 'FIRE'),
      character('f2', 'FIRE'),
      character('i1', 'ICE'),
      character('w1', 'WATER'),
    ];
    const manifest = emptyManifest();
    manifest.cards.push(manifestCard('w1', 'MYTHIC'));
    const picked = pickStarterCharacters(catalog, manifest, 10, () => 0).map((c) => c.key);
    expect(picked).toEqual(['f1', 'i1', 'f2']);
  });
});

describe('matchCatalogCharacter', () => {
  const entry = (name: string, anime: string, tags: string[]): CatalogCharacter => ({
    key: name,
    name,
    anime,
    element: 'FIRE',
    tags,
  });
  const catalog = [
    entry('Ami Mizuno', 'Sailor Moon', ['water', 'sailor_mercury']),
    entry('Makoto Kino', 'Sailor Moon', ['lightning', 'sailor_jupiter']),
    entry('Artoria Pendragon', 'Fate/stay night', ['light', 'excalibur']),
    entry('Lucy', 'Elfen Lied', ['shadow']),
    entry('Lucy', 'Cyberpunk: Edgerunners', ['lightning']),
  ];

  it('maps old bulk-generator names by anime, name words and tags', () => {
    expect(matchCatalogCharacter(catalog, 'Sailor Jupiter #3', 'Sailor Moon')?.name).toBe(
      'Makoto Kino',
    );
    expect(matchCatalogCharacter(catalog, 'Saber (Artoria) #2', 'Fate/stay night')?.name).toBe(
      'Artoria Pendragon',
    );
    expect(matchCatalogCharacter(catalog, 'Lucy (Nyu)', 'Elfen Lied')?.anime).toBe('Elfen Lied');
  });

  it('returns null for unknown anime, no overlap, or ties', () => {
    expect(matchCatalogCharacter(catalog, 'Toph Beifong', 'Avatar: The Last Airbender')).toBeNull();
    expect(matchCatalogCharacter(catalog, 'Luna', 'Sailor Moon')).toBeNull();
    expect(matchCatalogCharacter(catalog, 'Sailor Senshi', 'Sailor Moon')).toBeNull();
  });
});

describe('catalog & manifest files', () => {
  it('round-trips the manifest and rejects duplicate catalog keys', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tcg-catalog-'));
    const manifestPath = path.join(dir, 'manifest.json');
    expect(loadManifest(manifestPath)).toEqual(emptyManifest());

    const manifest = emptyManifest();
    manifest.cards.push(manifestCard('a', 'SIR'));
    manifest.assets.a = { assetId: 'asset-a', imageHash: 'h' };
    saveManifest(manifestPath, manifest);
    expect(loadManifest(manifestPath)).toEqual(manifest);

    const catalogPath = path.join(dir, 'characters.json');
    fs.writeFileSync(catalogPath, JSON.stringify([character('a', 'FIRE'), character('a', 'ICE')]));
    expect(() => loadCatalog(catalogPath)).toThrow('Duplicate character key');
    fs.rmSync(dir, { recursive: true });
  });

  it('builds stable character keys', () => {
    expect(slugifyCharacterKey('Rukia Kuchiki (Bankai)', "Frieren: Beyond Journey's End")).toBe(
      'rukia_kuchiki__frieren_beyond_journey_s_end',
    );
  });
});

describe('syncCatalogCharacter', () => {
  const anilist = (result: unknown) => ({ findCharacter: vi.fn().mockResolvedValue(result) });
  const danbooru = (tag: string | null, art: unknown) => ({
    resolveCharacterTag: vi.fn().mockResolvedValue(tag),
    findPortrait: vi.fn().mockResolvedValue(art),
  });
  const aniResult = {
    id: 42,
    name: 'Holo',
    imageUrl: 'https://ani/42.png',
    favourites: 900,
    mediaTitles: [],
  };

  it('uses Danbooru art when available', async () => {
    const { character: c, warnings } = await syncCatalogCharacter(character('holo', 'EARTH'), {
      anilist: anilist(aniResult) as never,
      danbooru: danbooru('holo', {
        postId: 5,
        imageUrl: 'https://cdn/5.jpg',
        artist: 'x',
        width: 1,
        height: 2,
      }) as never,
    });
    expect(warnings).toEqual([]);
    expect(c).toMatchObject({ anilistId: 42, favourites: 900, danbooruTag: 'holo' });
    expect(c.image).toEqual({
      url: 'https://cdn/5.jpg',
      source: 'DANBOORU',
      sourceId: '5',
      credit: 'Art: x · danbooru #5',
    });
  });

  it('passes AniList spellings to Danbooru and keeps a hand-set tag on force', async () => {
    const db = danbooru('ignored', { postId: 9, imageUrl: 'u', artist: null, width: 1, height: 2 });
    await syncCatalogCharacter(character('holo', 'EARTH'), {
      anilist: anilist({
        ...aniResult,
        name: 'Horo',
        mediaTitles: ['Ookami to Koushinryou'],
      }) as never,
      danbooru: db as never,
    });
    expect(db.resolveCharacterTag).toHaveBeenCalledWith(
      ['holo', 'Horo'],
      ['Test', 'Ookami to Koushinryou'],
    );

    const db2 = danbooru('ignored', {
      postId: 9,
      imageUrl: 'u',
      artist: null,
      width: 1,
      height: 2,
    });
    const { character: c } = await syncCatalogCharacter(
      { ...character('holo', 'EARTH'), danbooruTag: 'holo_(manual)' },
      { anilist: anilist(aniResult) as never, danbooru: db2 as never },
      { force: true },
    );
    expect(db2.resolveCharacterTag).not.toHaveBeenCalled();
    expect(db2.findPortrait).toHaveBeenCalledWith('holo_(manual)');
    expect(c.danbooruTag).toBe('holo_(manual)');
  });

  it('falls back to the AniList portrait and reports warnings', async () => {
    const { character: c, warnings } = await syncCatalogCharacter(character('holo', 'EARTH'), {
      anilist: anilist(aniResult) as never,
      danbooru: danbooru(null, null) as never,
    });
    expect(c.image).toMatchObject({ url: 'https://ani/42.png', source: 'ANILIST' });
    expect(warnings).toEqual(['Danbooru: no character tag']);
  });

  it('never replaces a MANUAL image and turns API errors into warnings', async () => {
    const manual = {
      ...character('holo', 'EARTH'),
      image: { url: 'x.png', source: 'MANUAL' as const, sourceId: 'm', credit: 'c' },
    };
    const failing = { findCharacter: vi.fn().mockRejectedValue(new Error('down')) };
    const db = danbooru('holo', null);
    const { character: c, warnings } = await syncCatalogCharacter(
      manual,
      { anilist: failing as never, danbooru: db as never },
      { force: true },
    );
    expect(c.image).toEqual(manual.image);
    expect(db.findPortrait).not.toHaveBeenCalled();
    expect(warnings).toEqual(['AniList: down']);
  });
});
