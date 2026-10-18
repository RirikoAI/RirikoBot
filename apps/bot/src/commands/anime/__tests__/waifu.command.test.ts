import { describe, it, expect, vi } from 'vitest';
import type { WaifuImImage } from '@ririko/services';
import type { BotServices } from '../../../services.js';
import { WAIFU_REROLL_ID, buildWaifuEmbed, createWaifuCommand } from '../waifu.command.js';
import { buttonInteraction, flush, makeContext } from './helpers.js';

const image = (id: number, overrides: Partial<WaifuImImage> = {}): WaifuImImage => ({
  id,
  url: `https://cdn.waifu.im/${id}.jpg`,
  extension: '.jpg',
  source: 'https://www.pixiv.net/artworks/1',
  isNsfw: false,
  width: 1000,
  height: 1500,
  dominantColor: null,
  favorites: 8,
  tags: [
    { name: 'Selfies', slug: 'selfies' },
    { name: 'Waifu', slug: 'waifu' },
  ],
  artists: [
    {
      name: 'LU',
      pixiv: 'https://www.pixiv.net/users/1',
      twitter: null,
      deviantArt: null,
      patreon: null,
    },
  ],
  ...overrides,
});

const servicesWith = (search: ReturnType<typeof vi.fn>) =>
  ({ waifuImClient: { search } }) as unknown as BotServices;

describe('/waifu (TASK-1441)', () => {
  it('serves SFW waifu images with the legacy embed and a regenerate button', async () => {
    const search = vi.fn().mockResolvedValue([image(7567)]);
    const { ctx, raw } = makeContext(null);

    await createWaifuCommand(servicesWith(search)).execute(ctx);

    expect(search).toHaveBeenCalledWith({ tags: ['waifu'], limit: 10 });
    const payload = raw.editReply.mock.calls[0]![0];
    const embed = payload.embeds[0].data;
    expect(embed.title).toBe('Random Waifu Image');
    expect(embed.image.url).toBe('https://cdn.waifu.im/7567.jpg');
    expect(embed.author).toMatchObject({
      name: 'LU via Waifu.im',
      url: 'https://www.pixiv.net/users/1',
    });
    expect(embed.fields).toEqual([
      { name: 'Tags', value: 'Selfies, Waifu', inline: true },
      { name: 'Favorites', value: '8', inline: true },
    ]);
    expect(payload.components[0].components[0].data.custom_id).toBe(WAIFU_REROLL_ID);
  });

  it('rerolls for the invoker only', async () => {
    // waifu.im may hand back the same "random" image again; the unseen one must win.
    const search = vi
      .fn()
      .mockResolvedValueOnce([image(1)])
      .mockResolvedValueOnce([image(1), image(2)]);
    const { ctx, collector } = makeContext(null);
    await createWaifuCommand(servicesWith(search)).execute(ctx);

    const intruder = buttonInteraction(WAIFU_REROLL_ID, 'user-2');
    collector.emit('collect', intruder);
    await flush();
    expect(intruder.reply).toHaveBeenCalledWith(expect.objectContaining({ ephemeral: true }));

    const owner = buttonInteraction(WAIFU_REROLL_ID);
    collector.emit('collect', owner);
    await flush();
    expect(search).toHaveBeenLastCalledWith({ tags: ['waifu'], limit: 10 });
    expect(owner.editReply.mock.calls[0]![0].embeds[0].data.image.url).toBe(
      'https://cdn.waifu.im/2.jpg',
    );
  });

  it('reports an unreachable API', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { ctx, raw } = makeContext(null);
    await createWaifuCommand(servicesWith(vi.fn().mockRejectedValue(new Error('403')))).execute(
      ctx,
    );
    expect(raw.editReply.mock.calls[0]![0].content).toMatch(/unreachable/);
  });

  it('falls back to the waifu.im author link when no artist is credited', () => {
    const embed = buildWaifuEmbed(image(3, { artists: [], source: null })).data;
    expect(embed.author).toMatchObject({ name: 'via Waifu.im', url: 'https://waifu.im' });
    expect(embed.url).toBeUndefined();
  });
});
