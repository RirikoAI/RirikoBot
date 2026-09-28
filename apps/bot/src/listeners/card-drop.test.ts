import { describe, expect, it, vi } from 'vitest';
import type { Message } from 'discord.js';
import type { BotServices } from '../services.js';
import { handleCardDrop } from './card-drop.js';

const drop = {
  id: 'drop-1',
  guildId: 'g1',
  channelId: 'c1',
  card: { id: 'card-1', name: 'Power', rarity: 'RARE', element: 'FIRE' },
  asset: { id: 'asset-1', sourceId: 'source-1' },
  serialNumber: 1,
  formattedSerial: '#0001/1000',
  spawnedAt: 0,
  expiresAt: 60_000,
  claimed: false,
  claimedBy: null,
};

function setup(options: { drop?: unknown; render?: () => Promise<Buffer>; sendable?: boolean }) {
  const send = vi.fn().mockResolvedValue(undefined);
  const recordMessage = vi.fn().mockResolvedValue(options.drop ?? null);
  const services = {
    dropManager: { recordMessage },
    guildSettingsService: { getSettings: vi.fn().mockResolvedValue({ prefix: '?' }) },
    waifuAssetRepo: { findSourceById: vi.fn().mockResolvedValue(null) },
    waifuCardRepo: { count: vi.fn().mockResolvedValue(10) },
    cardImageService: {
      getCardImage: vi.fn(options.render ?? (async () => Buffer.from('png'))),
    },
  } as unknown as BotServices;
  const message = {
    guild: { id: 'g1' },
    channelId: 'c1',
    author: { id: 'u1' },
    channel: { isSendable: () => options.sendable ?? true, send },
  } as unknown as Message;
  return { services, message, send, recordMessage };
}

describe('handleCardDrop', () => {
  it('counts the message and posts nothing below the threshold', async () => {
    const { services, message, send, recordMessage } = setup({});
    await handleCardDrop(message, services);
    expect(recordMessage).toHaveBeenCalledWith('g1', 'c1', 'u1');
    expect(send).not.toHaveBeenCalled();
  });

  it('posts the drop with its card image and how to claim it', async () => {
    const { services, message, send } = setup({ drop });
    await handleCardDrop(message, services);
    const payload = send.mock.calls[0]![0];
    const embed = payload.embeds[0].toJSON();
    expect(embed.title).toBe('🃏 A card dropped: Power!');
    expect(embed.description).toContain('#0001/1000');
    expect(embed.description).toContain('`?card claim`');
    expect(embed.description).toContain('<t:60:R>');
    expect(embed.image.url).toBe('attachment://card-drop.png');
    expect(payload.files).toEqual([{ attachment: Buffer.from('png'), name: 'card-drop.png' }]);
  });

  it('still posts the drop when the card image fails to render', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { services, message, send } = setup({
      drop,
      render: async () => {
        throw new Error('canvas down');
      },
    });
    await handleCardDrop(message, services);
    expect(send.mock.calls[0]![0].files).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('never throws when the drop fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { services, message } = setup({ drop, sendable: true });
    (services.dropManager.recordMessage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('db down'),
    );
    await expect(handleCardDrop(message, services)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('skips channels Ririko cannot post in and messages outside a guild', async () => {
    const { services, message, send } = setup({ drop, sendable: false });
    await handleCardDrop(message, services);
    expect(send).not.toHaveBeenCalled();

    const dm = { ...message, guild: null } as unknown as Message;
    await handleCardDrop(dm, services);
    expect(services.dropManager.recordMessage).toHaveBeenCalledTimes(1);
  });
});
