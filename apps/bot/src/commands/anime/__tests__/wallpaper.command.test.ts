import { describe, it, expect, vi } from 'vitest';
import type { Wallpaper } from '@ririko/services';
import type { BotServices } from '../../../services.js';
import {
  WALLPAPER_ACTION_ID,
  WALLPAPER_SOURCE_ID,
  buildWallpaperEmbed,
  createWallpaperCommand,
} from '../wallpaper.command.js';
import { flush, makeContext, selectInteraction } from './helpers.js';

const wallpaper = (id: string, overrides: Partial<Wallpaper> = {}): Wallpaper => ({
  id,
  pageUrl: `https://wallhaven.cc/w/${id}`,
  imageUrl: `https://w.wallhaven.cc/full/xx/wallhaven-${id}.jpg`,
  thumbnailUrl: null,
  resolution: '1920x1080',
  favorites: 1200,
  views: 34000,
  source: 'https://www.pixiv.net/artworks/1',
  ...overrides,
});

function setup(next: ReturnType<typeof vi.fn>, search: string | null = 'Frieren') {
  const createSession = vi.fn().mockReturnValue({ next });
  const services = { wallpaperService: { createSession } } as unknown as BotServices;
  const context = makeContext(search);
  return { ...context, createSession, command: createWallpaperCommand(services) };
}

const menuOf = (payload: {
  components: Array<{ components: Array<{ data: { custom_id: string } }> }>;
}) => payload.components[0]!.components[0]!;

const pick = (customId: string, value: string, userId = 'user-1') => ({
  ...selectInteraction(value, userId),
  customId,
});

describe('/wallpaper (TASK-1442)', () => {
  it('opens with the legacy source picker', async () => {
    const { command, ctx, raw, createSession } = setup(vi.fn());

    await command.execute(ctx);

    expect(createSession).toHaveBeenCalledWith('Frieren');
    const prompt = raw.editReply.mock.calls[0]![0];
    expect(prompt.embeds[0].data.description).toContain(
      'Select a source to search for **Frieren**',
    );
    const menu = menuOf(prompt) as unknown as {
      data: { custom_id: string };
      options: Array<{ data: { value: string } }>;
    };
    expect(menu.data.custom_id).toBe(WALLPAPER_SOURCE_ID);
    expect(menu.options.map((o) => o.data.value)).toEqual(['wallhaven', 'zerochan', 'konachan']);
  });

  it('shows three wallpapers from the picked source, then loads more, switches source, and closes', async () => {
    const next = vi
      .fn()
      .mockResolvedValueOnce([wallpaper('a'), wallpaper('b'), wallpaper('c')])
      .mockResolvedValueOnce([wallpaper('d')]);
    const { command, ctx, collector } = setup(next);
    await command.execute(ctx);

    const source = pick(WALLPAPER_SOURCE_ID, 'wallhaven');
    collector.emit('collect', source);
    await flush();
    expect(next).toHaveBeenCalledWith('wallhaven', 3);
    const results = source.editReply.mock.calls[0]![0];
    expect(results.content).toBe('🖼️ Here are wallpapers for **Frieren** (Courtesy of WallHaven)');
    expect(
      results.embeds.map((e: { data: { image: { url: string } } }) => e.data.image.url),
    ).toEqual([
      'https://w.wallhaven.cc/full/xx/wallhaven-a.jpg',
      'https://w.wallhaven.cc/full/xx/wallhaven-b.jpg',
      'https://w.wallhaven.cc/full/xx/wallhaven-c.jpg',
    ]);
    const actions = menuOf(results) as unknown as {
      data: { custom_id: string };
      options: Array<{ data: { value: string } }>;
    };
    expect(actions.data.custom_id).toBe(WALLPAPER_ACTION_ID);
    expect(actions.options.map((o) => o.data.value)).toEqual(['more', 'sources', 'done']);

    const more = pick(WALLPAPER_ACTION_ID, 'more');
    collector.emit('collect', more);
    await flush();
    expect(next).toHaveBeenLastCalledWith('wallhaven', 3);
    expect(more.editReply.mock.calls[0]![0].embeds).toHaveLength(1);

    const sources = pick(WALLPAPER_ACTION_ID, 'sources');
    collector.emit('collect', sources);
    await flush();
    expect(menuOf(sources.update!.mock.calls[0]![0]).data.custom_id).toBe(WALLPAPER_SOURCE_ID);

    const done = pick(WALLPAPER_ACTION_ID, 'done');
    collector.emit('collect', done);
    await flush();
    expect(done.update!.mock.calls[0]![0]).toMatchObject({ components: [] });
  });

  it('offers the source picker again when a source fails or runs out', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const next = vi
      .fn()
      .mockRejectedValueOnce(new Error('HTTP 503'))
      .mockResolvedValueOnce([wallpaper('bad', { imageUrl: 'ftp://nope' })]);
    const { command, ctx, collector } = setup(next);
    await command.execute(ctx);

    const failing = pick(WALLPAPER_SOURCE_ID, 'zerochan');
    collector.emit('collect', failing);
    await flush();
    const failed = failing.editReply.mock.calls[0]![0];
    expect(failed.embeds[0].data.description).toContain('Zerochan is unreachable right now');
    expect(menuOf(failed).data.custom_id).toBe(WALLPAPER_SOURCE_ID);

    const emptySource = pick(WALLPAPER_SOURCE_ID, 'konachan');
    collector.emit('collect', emptySource);
    await flush();
    expect(emptySource.editReply.mock.calls[0]![0].embeds[0].data.description).toContain(
      'No wallpapers for **Frieren** on Konachan',
    );
  });

  it('keeps the menus to the invoker and asks for a search term', async () => {
    const next = vi.fn();
    const { command, ctx, collector } = setup(next);
    await command.execute(ctx);

    const intruder = pick(WALLPAPER_SOURCE_ID, 'wallhaven', 'user-2');
    collector.emit('collect', intruder);
    await flush();
    expect(intruder.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
    expect(next).not.toHaveBeenCalled();

    const empty = setup(vi.fn(), null);
    await empty.command.execute(empty.ctx);
    expect(empty.raw.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));
    expect(empty.createSession).not.toHaveBeenCalled();
  });

  it('renders stats that the source provides and links the original artwork', () => {
    const embed = buildWallpaperEmbed(wallpaper('a'), 'wallhaven').data;
    expect(embed.footer!.text).toBe('1920x1080 • ❤️ 1,200 • 👁️ 34,000 • WallHaven');
    expect(embed.description).toBe('[Original artwork](https://www.pixiv.net/artworks/1)');

    const bare = buildWallpaperEmbed(
      wallpaper('b', { favorites: null, views: null, source: null }),
      'zerochan',
    ).data;
    expect(bare.footer!.text).toBe('1920x1080 • Zerochan');
    expect(bare.description).toBeUndefined();
  });
});
