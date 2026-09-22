import { describe, it, expect, vi } from 'vitest';
import type { Wallpaper } from '@ririko/services';
import type { BotServices } from '../../../services.js';
import { WALLPAPER_NEXT_ID, WALLPAPER_PREV_ID, createWallpaperCommand } from '../wallpaper.command.js';
import { buttonInteraction, flush, makeContext } from './helpers.js';

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

const servicesWith = (search: ReturnType<typeof vi.fn>) =>
  ({ wallhavenClient: { search } }) as unknown as BotServices;

const buttons = (payload: { components: Array<{ components: Array<{ data: Record<string, unknown> }> }> }) =>
  payload.components[0]!.components.map((c) => c.data);

describe('/wallpaper (TASK-1442)', () => {
  it('searches by query and renders the first result with pager and full-resolution link', async () => {
    const search = vi.fn().mockResolvedValue([wallpaper('aaa'), wallpaper('bbb')]);
    const { ctx, raw } = makeContext('Frieren');

    await createWallpaperCommand(servicesWith(search)).execute(ctx);

    expect(search).toHaveBeenCalledWith({ query: 'Frieren' });
    const payload = raw.editReply.mock.calls[0]![0];
    const embed = payload.embeds[0].data;
    expect(embed.title).toBe('🖼️ Wallpaper: Frieren');
    expect(embed.image.url).toBe('https://w.wallhaven.cc/full/xx/wallhaven-aaa.jpg');
    expect(embed.footer.text).toMatch(/^Wallpaper 1 of 2/);
    const [prev, next, link] = buttons(payload);
    expect(prev).toMatchObject({ custom_id: WALLPAPER_PREV_ID, disabled: true });
    expect(next).toMatchObject({ custom_id: WALLPAPER_NEXT_ID, disabled: false });
    expect(link).toMatchObject({ url: 'https://w.wallhaven.cc/full/xx/wallhaven-aaa.jpg' });
  });

  it('pages through results for the invoker only', async () => {
    const search = vi.fn().mockResolvedValue([wallpaper('aaa'), wallpaper('bbb')]);
    const { ctx, collector } = makeContext(null);
    await createWallpaperCommand(servicesWith(search)).execute(ctx);
    expect(search).toHaveBeenCalledWith({});

    const intruder = buttonInteraction(WALLPAPER_NEXT_ID, 'user-2');
    collector.emit('collect', intruder);
    await flush();
    expect(intruder.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));

    const next = buttonInteraction(WALLPAPER_NEXT_ID);
    collector.emit('collect', next);
    await flush();
    const page2 = next.update!.mock.calls[0]![0];
    expect(page2.embeds[0].data.title).toBe('🖼️ Random anime wallpaper');
    expect(page2.embeds[0].data.footer.text).toMatch(/^Wallpaper 2 of 2/);
    expect(buttons(page2)[1]).toMatchObject({ disabled: true });

    const prev = buttonInteraction(WALLPAPER_PREV_ID);
    collector.emit('collect', prev);
    await flush();
    expect(prev.update!.mock.calls[0]![0].embeds[0].data.footer.text).toMatch(/^Wallpaper 1 of 2/);
  });

  it('skips results with non-http URLs and reports empty or failed searches', async () => {
    const empty = makeContext('nothing');
    await createWallpaperCommand(
      servicesWith(vi.fn().mockResolvedValue([wallpaper('bad', { imageUrl: 'ftp://x' })])),
    ).execute(empty.ctx);
    expect(empty.raw.editReply).toHaveBeenCalledWith({ content: '🔍 No wallpapers found for **nothing**.' });

    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing = makeContext(null);
    await createWallpaperCommand(servicesWith(vi.fn().mockRejectedValue(new Error('429')))).execute(failing.ctx);
    expect(failing.raw.editReply.mock.calls[0]![0].content).toMatch(/unreachable/);
  });
});
