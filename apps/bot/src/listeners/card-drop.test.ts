import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  messageId: null,
};

function setup(options: { drop?: unknown; render?: () => Promise<Buffer>; sendable?: boolean }) {
  const send = vi.fn().mockResolvedValue({ id: 'msg-1' });
  const recordMessage = vi.fn().mockResolvedValue(options.drop ?? null);
  const setDropMessage = vi.fn((_dropId: string, messageId: string) => {
    if (options.drop) (options.drop as { messageId: string | null }).messageId = messageId;
  });
  const editMessage = vi.fn().mockResolvedValue(undefined);
  const fetchChannel = vi
    .fn()
    .mockResolvedValue({ isTextBased: () => true, messages: { edit: editMessage } });
  const services = {
    dropManager: { recordMessage, setDropMessage },
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
    client: { channels: { fetch: fetchChannel } },
  } as unknown as Message;
  return { services, message, send, recordMessage, setDropMessage, editMessage };
}

describe('handleCardDrop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts the message and posts nothing below the threshold', async () => {
    const { services, message, send, recordMessage } = setup({});
    await handleCardDrop(message, services);
    expect(recordMessage).toHaveBeenCalledWith('g1', 'c1', 'u1');
    expect(send).not.toHaveBeenCalled();
  });

  it('posts the drop with its card image and a Claim button', async () => {
    const { services, message, send, setDropMessage } = setup({ drop: { ...drop } });
    await handleCardDrop(message, services);
    const payload = send.mock.calls[0]![0];
    const embed = payload.embeds[0].toJSON();
    expect(embed.title).toBe('🃏 A card dropped: Power!');
    expect(embed.description).toContain('#0001/1000');
    expect(embed.description).toContain('Press **Claim**');
    expect(embed.description).toContain('<t:60:R>');
    expect(embed.image.url).toBe('attachment://card-drop.png');
    expect(payload.files).toEqual([{ attachment: Buffer.from('png'), name: 'card-drop.png' }]);
    const row = payload.components[0].toJSON();
    expect(row.components).toHaveLength(1);
    expect(row.components[0].custom_id).toBe('carddrop:claim:drop-1');
    expect(setDropMessage).toHaveBeenCalledWith('drop-1', 'msg-1');
  });

  it('edits the drop to the expired state when nobody claims it', async () => {
    const { services, message, editMessage } = setup({ drop: { ...drop } });
    await handleCardDrop(message, services);
    expect(editMessage).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(61_000);

    expect(editMessage).toHaveBeenCalledTimes(1);
    const [messageId, edit] = editMessage.mock.calls[0]!;
    expect(messageId).toBe('msg-1');
    expect(edit.components).toEqual([]);
    expect(edit.embeds[0].toJSON().title).toContain('Expired');
  });

  it('shows the claimed state when a command claim won during the post', async () => {
    const claimedDuringPost = { ...drop };
    const { services, message, send, editMessage } = setup({ drop: claimedDuringPost });
    send.mockImplementationOnce(async () => {
      claimedDuringPost.claimed = true;
      (claimedDuringPost as { claimedBy: string | null }).claimedBy = 'u2';
      return { id: 'msg-1' };
    });

    await handleCardDrop(message, services);

    expect(editMessage).toHaveBeenCalledTimes(1);
    const [messageId, edit] = editMessage.mock.calls[0]!;
    expect(messageId).toBe('msg-1');
    expect(edit.components).toEqual([]);
    expect(edit.attachments).toEqual([]);
    expect(edit.embeds[0].toJSON().description).toContain('<@u2>');

    // The expiry timer leaves a claimed drop alone.
    await vi.advanceTimersByTimeAsync(61_000);
    expect(editMessage).toHaveBeenCalledTimes(1);
  });

  it('still posts the drop when the card image fails to render', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { services, message, send } = setup({
      drop: { ...drop },
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
    const { services, message } = setup({ drop: { ...drop }, sendable: true });
    (services.dropManager.recordMessage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('db down'),
    );
    await expect(handleCardDrop(message, services)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('skips channels Ririko cannot post in and messages outside a guild', async () => {
    const { services, message, send } = setup({ drop: { ...drop }, sendable: false });
    await handleCardDrop(message, services);
    expect(send).not.toHaveBeenCalled();

    const dm = { ...message, guild: null } as unknown as Message;
    await handleCardDrop(dm, services);
    expect(services.dropManager.recordMessage).toHaveBeenCalledTimes(1);
  });
});
