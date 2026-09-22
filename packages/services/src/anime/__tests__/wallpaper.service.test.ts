import { describe, it, expect, vi } from 'vitest';
import { WALLPAPER_SOURCES, WallpaperService, type WallpaperProvider } from '../wallpaper.service.js';
import type { Wallpaper } from '../types.js';

const wp = (id: string, imageUrl = `https://img/${id}.jpg`): Wallpaper => ({
  id,
  pageUrl: `https://page/${id}`,
  imageUrl,
  thumbnailUrl: null,
  resolution: '1x1',
  favorites: null,
  views: null,
  source: null,
});

function provider(pages: Wallpaper[][], resolveImageUrl?: WallpaperProvider['resolveImageUrl']) {
  const search = vi.fn(async (_query: string, page: number) => pages[page - 1] ?? []);
  return resolveImageUrl ? { search, resolveImageUrl } : { search };
}

const empty = () => provider([]);

describe('WallpaperService', () => {
  it('lists the three SFW sources in menu order', () => {
    expect(WALLPAPER_SOURCES.map((s) => s.id)).toEqual(['wallhaven', 'zerochan', 'konachan']);
  });

  it('never repeats a wallpaper and pages further only when the pool runs dry', async () => {
    const wallhaven = provider([
      [wp('a'), wp('b'), wp('c'), wp('d')],
      [wp('d'), wp('e')],
    ]);
    const service = new WallpaperService({ wallhaven, zerochan: empty(), konachan: empty() }, () => 0);
    const session = service.createSession(' frieren ');

    expect((await session.next('wallhaven')).map((w) => w.id)).toEqual(['a', 'b', 'c']);
    expect(wallhaven.search).toHaveBeenCalledTimes(1);
    expect(wallhaven.search).toHaveBeenCalledWith('frieren', 1);

    // d is left from page 1; page 2 only adds e (d was shown); page 3 is empty.
    expect((await session.next('wallhaven')).map((w) => w.id)).toEqual(['d', 'e']);
    expect(await session.next('wallhaven')).toEqual([]);
    expect(wallhaven.search).toHaveBeenCalledTimes(3);
  });

  it('keeps separate progress per source', async () => {
    const wallhaven = provider([[wp('w1')]]);
    const konachan = provider([[wp('k1'), wp('k2')]]);
    const session = new WallpaperService({ wallhaven, zerochan: empty(), konachan }, () => 0).createSession('x');

    expect((await session.next('wallhaven', 1)).map((w) => w.id)).toEqual(['w1']);
    expect((await session.next('konachan', 1)).map((w) => w.id)).toEqual(['k1']);
    expect((await session.next('konachan', 1)).map((w) => w.id)).toEqual(['k2']);
  });

  it('resolves missing image URLs and skips results that cannot be resolved', async () => {
    const resolve = vi.fn(async (id: string) => (id === 'b' ? null : `https://resolved/${id}.jpg`));
    const zerochan = provider([[wp('a', ''), wp('b', ''), wp('c')]], resolve);
    const session = new WallpaperService({ wallhaven: empty(), zerochan, konachan: empty() }, () => 0).createSession(
      'x',
    );

    const shown = await session.next('zerochan');

    expect(shown.map((w) => [w.id, w.imageUrl])).toEqual([
      ['a', 'https://resolved/a.jpg'],
      ['c', 'https://img/c.jpg'],
    ]);
    expect(resolve).toHaveBeenCalledTimes(2);
  });
});
