import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ButtonStyle,
  MessageFlags,
  type ButtonInteraction,
  type Client,
  type User,
} from 'discord.js';
import { DropManager, type ActiveDrop, type CardGenerator } from '@ririko/services';
import type { WaifuAssetRepository, WaifuCardRepository } from '@ririko/database';
import {
  buildCardDropClaimRow,
  buildClaimConfirmation,
  buildPrefixClaimReply,
  completeCardDropClaim,
  handleCardDropClaimButton,
  scheduleCardDropExpiry,
  showDropClaimed,
  type CardDropServices,
} from './card-drop-claim.js';

const GUILD = 'guild-1';
const CHANNEL = 'channel-1';
const MESSAGE = 'message-1';

const asset = { id: 'asset-1', sourceId: 'source-1' };
const card = {
  id: 'card-1',
  name: 'Power',
  rarity: 'RARE',
  element: 'FIRE',
  health: 2000,
  attack: 500,
  defense: 300,
  speed: 100,
};

/** One active asset and a fixed card, so the drop is the same on every run. */
function setup() {
  const createUserCard = vi.fn(async (data: { userId: string }) => ({
    id: 'user-card-1',
    userId: data.userId,
  }));
  const cardRepo = {
    findByAssetId: vi.fn().mockResolvedValue(card),
    reserveSerialNumber: vi.fn().mockResolvedValue(1),
    createUserCard,
    count: vi.fn().mockResolvedValue(10),
  };
  const assetRepo = {
    findActiveAssets: vi.fn().mockResolvedValue([asset]),
    findSourceById: vi.fn().mockResolvedValue({
      id: 'source-1',
      name: 'waifu.im',
      baseUrl: 'https://api.waifu.im',
      attributionText: 'Image source: waifu.im',
    }),
  };
  const generator = {
    generateCard: () => ({ rarity: card.rarity, element: card.element }),
  } as unknown as CardGenerator;
  const dropManager = new DropManager(
    cardRepo as unknown as WaifuCardRepository,
    assetRepo as unknown as WaifuAssetRepository,
    generator,
  );
  const syncCollection = vi.fn().mockResolvedValue(undefined);
  const getCardImage = vi.fn(async () => Buffer.from('card-png'));
  const services = {
    dropManager,
    achievementService: { syncCollection },
    waifuAssetRepo: assetRepo,
    waifuCardRepo: cardRepo,
    cardImageService: { getCardImage },
  } as unknown as CardDropServices;

  const editMessage = vi.fn().mockResolvedValue(undefined);
  const channelSend = vi.fn().mockResolvedValue(undefined);
  const channel = { isTextBased: () => true, messages: { edit: editMessage }, send: channelSend };
  const fetchChannel = vi.fn().mockResolvedValue(channel);
  const client = { channels: { fetch: fetchChannel } } as unknown as Client;

  async function spawn(): Promise<ActiveDrop> {
    const drop = await dropManager.spawnDrop(GUILD, CHANNEL);
    dropManager.setDropMessage(drop!.id, MESSAGE);
    return drop!;
  }

  function press(dropId: string, userId: string, dm = vi.fn().mockResolvedValue(undefined)) {
    const deferUpdate = vi.fn().mockResolvedValue(undefined);
    const followUp = vi.fn().mockResolvedValue(undefined);
    const editReply = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      customId: `carddrop:claim:${dropId}`,
      user: { id: userId, client, send: dm },
      deferUpdate,
      followUp,
      editReply,
    } as unknown as ButtonInteraction;
    return { interaction, deferUpdate, followUp, editReply, dm };
  }

  return {
    services,
    dropManager,
    client,
    spawn,
    press,
    createUserCard,
    syncCollection,
    getCardImage,
    assetRepo,
    editMessage,
    channelSend,
    fetchChannel,
  };
}

describe('buildCardDropClaimRow', () => {
  it('holds one Claim button with the drop id in its custom id', () => {
    const row = buildCardDropClaimRow('drop-9').toJSON();
    expect(row.components).toHaveLength(1);
    expect(row.components[0]).toMatchObject({
      custom_id: 'carddrop:claim:drop-9',
      label: 'Claim',
      style: ButtonStyle.Primary,
    });
  });
});

describe('handleCardDropClaimButton', () => {
  it('mints the card, DMs the full card and edits the drop message for the first valid press', async () => {
    const t = setup();
    const drop = await t.spawn();
    const { interaction, deferUpdate, followUp, dm } = t.press(drop.id, 'winner');

    await handleCardDropClaimButton(interaction, t.services);

    // Discord allows 3 seconds, so the press is answered before the mint.
    expect(deferUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      t.createUserCard.mock.invocationCallOrder[0]!,
    );
    expect(t.createUserCard).toHaveBeenCalledTimes(1);
    expect(t.createUserCard).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'winner', cardId: 'card-1', serialNumber: 1 }),
    );
    expect(t.syncCollection.mock.calls).toEqual([['winner']]);

    const dmPayload = dm.mock.calls[0]![0];
    const dmEmbed = dmPayload.embeds[0].toJSON();
    expect(dmEmbed.title).toBe('🎉 Card Claimed: Power!');
    expect(dmEmbed.description).toContain('<@winner>');
    expect(dmEmbed.description).toContain('HP `2000`');
    expect(dmEmbed.image.url).toBe('attachment://card.png');
    expect(dmEmbed.footer.text).toContain('Image source: waifu.im');
    expect(dmPayload.files).toEqual([{ attachment: Buffer.from('card-png'), name: 'card.png' }]);

    expect(t.fetchChannel).toHaveBeenCalledWith(CHANNEL);
    expect(t.editMessage).toHaveBeenCalledTimes(1);
    const [messageId, edit] = t.editMessage.mock.calls[0]!;
    expect(messageId).toBe(MESSAGE);
    expect(edit.components).toEqual([]);
    expect(edit.attachments).toEqual([]);
    const claimedEmbed = edit.embeds[0].toJSON();
    expect(claimedEmbed.description).toContain('<@winner>');
    expect(claimedEmbed.description).toContain('Power');
    expect(claimedEmbed.image).toBeUndefined();
    expect(t.channelSend).not.toHaveBeenCalled();

    expect(followUp).toHaveBeenCalledTimes(1);
    const confirmation = followUp.mock.calls[0]![0];
    expect(confirmation.flags).toBe(MessageFlags.Ephemeral);
    expect(confirmation.content).toContain('in your DMs');
    expect(confirmation.embeds).toEqual([]);
    expect(confirmation.files).toEqual([]);
  });

  it('keeps the claim and shows the card in the ephemeral message when the DM fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = setup();
    const drop = await t.spawn();
    const closedDm = vi.fn().mockRejectedValue(new Error('Cannot send messages to this user'));
    const { interaction, followUp } = t.press(drop.id, 'winner', closedDm);

    await handleCardDropClaimButton(interaction, t.services);

    expect(t.createUserCard).toHaveBeenCalledTimes(1);
    expect(t.editMessage).toHaveBeenCalledTimes(1);
    const confirmation = followUp.mock.calls[0]![0];
    expect(confirmation.flags).toBe(MessageFlags.Ephemeral);
    expect(confirmation.content).toContain('could not DM you');
    expect(confirmation.embeds[0].toJSON().image.url).toBe('attachment://card.png');
    expect(confirmation.files).toEqual([{ attachment: Buffer.from('card-png'), name: 'card.png' }]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Could not DM'));
    warn.mockRestore();
  });

  it('tells a late presser who won, and only them', async () => {
    const t = setup();
    const drop = await t.spawn();
    await handleCardDropClaimButton(t.press(drop.id, 'winner').interaction, t.services);
    t.editMessage.mockClear();

    const late = t.press(drop.id, 'late');
    await handleCardDropClaimButton(late.interaction, t.services);

    expect(late.followUp).toHaveBeenCalledWith({
      content: expect.stringContaining('<@winner>'),
      flags: MessageFlags.Ephemeral,
    });
    expect(late.dm).not.toHaveBeenCalled();
    expect(t.editMessage).not.toHaveBeenCalled();
    expect(t.createUserCard).toHaveBeenCalledTimes(1);
  });

  it('leaves the button for others when the presser is on the anti-sniping cooldown', async () => {
    const t = setup();
    const first = await t.spawn();
    await handleCardDropClaimButton(t.press(first.id, 'sniper').interaction, t.services);
    t.editMessage.mockClear();

    const second = await t.spawn();
    const sniper = t.press(second.id, 'sniper');
    await handleCardDropClaimButton(sniper.interaction, t.services);

    expect(sniper.followUp).toHaveBeenCalledWith({
      content: expect.stringContaining('Anti-sniping cooldown'),
      flags: MessageFlags.Ephemeral,
    });
    expect(sniper.editReply).not.toHaveBeenCalled();
    expect(t.editMessage).not.toHaveBeenCalled();
    expect(second.claimed).toBe(false);
  });

  it('removes the button of a drop that no longer exists, as after a restart', async () => {
    const t = setup();
    const { interaction, followUp, editReply } = t.press('gone', 'someone');

    await handleCardDropClaimButton(interaction, t.services);

    expect(editReply).toHaveBeenCalledWith({ components: [] });
    expect(followUp).toHaveBeenCalledWith({
      content: expect.stringContaining('no longer exists'),
      flags: MessageFlags.Ephemeral,
    });
    expect(t.createUserCard).not.toHaveBeenCalled();
  });

  it('still answers the presser when the dead button cannot be removed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = setup();
    const { interaction, followUp, editReply } = t.press('gone', 'someone');
    editReply.mockRejectedValueOnce(new Error('Unknown Message'));

    await handleCardDropClaimButton(interaction, t.services);

    expect(followUp).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Unknown Message'));
    warn.mockRestore();
  });

  it('answers with an ephemeral error when the mint fails, and the drop stays claimable', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const t = setup();
    const drop = await t.spawn();
    t.createUserCard.mockRejectedValueOnce(new Error('db down'));
    const failed = t.press(drop.id, 'unlucky');

    await handleCardDropClaimButton(failed.interaction, t.services);

    expect(failed.followUp).toHaveBeenCalledWith({
      content: expect.stringContaining('press **Claim** again'),
      flags: MessageFlags.Ephemeral,
    });
    expect(failed.dm).not.toHaveBeenCalled();
    expect(t.editMessage).not.toHaveBeenCalled();
    expect(t.syncCollection).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('db down'));

    const retry = t.press(drop.id, 'unlucky');
    await handleCardDropClaimButton(retry.interaction, t.services);
    expect(retry.dm).toHaveBeenCalledTimes(1);
    expect(t.editMessage).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it('mints one card and sends one DM for presses at the same time', async () => {
    const t = setup();
    const drop = await t.spawn();
    const first = t.press(drop.id, 'first');
    const second = t.press(drop.id, 'second');

    await Promise.all([
      handleCardDropClaimButton(first.interaction, t.services),
      handleCardDropClaimButton(second.interaction, t.services),
    ]);

    expect(t.createUserCard).toHaveBeenCalledTimes(1);
    expect(first.dm).toHaveBeenCalledTimes(1);
    expect(second.dm).not.toHaveBeenCalled();
    expect(second.followUp.mock.calls[0]![0].content).toContain('already been claimed');
    expect(t.editMessage).toHaveBeenCalledTimes(1);
  });
});

describe('completeCardDropClaim', () => {
  function user(t: ReturnType<typeof setup>) {
    const send = vi.fn().mockResolvedValue(undefined);
    return { user: { id: 'winner', client: t.client, send } as unknown as User, send };
  }

  async function claimed(t: ReturnType<typeof setup>): Promise<ActiveDrop> {
    const drop = await t.spawn();
    await t.dropManager.claimDrop(drop.id, 'winner');
    return drop;
  }

  it('does not fail the claim or the DM when the edit fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = setup();
    const drop = await claimed(t);
    t.editMessage.mockRejectedValueOnce(new Error('Missing Permissions'));
    const { user: winner, send } = user(t);

    const completed = await completeCardDropClaim(winner, drop, t.services);

    expect(completed.dmSent).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Missing Permissions'));
    warn.mockRestore();
  });

  it('skips the edit while the message id is not known', async () => {
    const t = setup();
    const drop = await t.dropManager.spawnDrop(GUILD, CHANNEL);
    await t.dropManager.claimDrop(drop!.id, 'winner');
    const { user: winner, send } = user(t);

    await completeCardDropClaim(winner, drop!, t.services);

    expect(t.fetchChannel).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('logs a drop channel that cannot hold messages', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = setup();
    const drop = await claimed(t);
    t.fetchChannel.mockResolvedValueOnce({ isTextBased: () => false });

    await showDropClaimed(t.client, drop);

    expect(t.editMessage).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(CHANNEL));
    warn.mockRestore();
  });

  it('sends the card as text when the image fails to render', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = setup();
    const drop = await claimed(t);
    t.getCardImage.mockRejectedValueOnce(new Error('canvas down'));
    const { user: winner, send } = user(t);

    await completeCardDropClaim(winner, drop, t.services);

    const payload = send.mock.calls[0]![0];
    expect(payload.files).toEqual([]);
    expect(payload.embeds[0].toJSON().image).toBeUndefined();
    warn.mockRestore();
  });

  it('falls back to the default attribution when the source lookup fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = setup();
    const drop = await claimed(t);
    t.assetRepo.findSourceById.mockRejectedValueOnce(new Error('db down'));
    const { user: winner, send } = user(t);

    await completeCardDropClaim(winner, drop, t.services);

    expect(send.mock.calls[0]![0].embeds[0].toJSON().footer.text).toContain(
      'Image source: waifu.im',
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('db down'));
    warn.mockRestore();
  });

  it('uses the common tier for an unknown rarity', async () => {
    const t = setup();
    const drop = await claimed(t);
    const { user: winner, send } = user(t);

    await completeCardDropClaim(
      winner,
      { ...drop, card: { ...drop.card, rarity: 'UNKNOWN' } } as ActiveDrop,
      t.services,
    );

    expect(send.mock.calls[0]![0].embeds[0].toJSON().description).toContain('`Common`');
  });
});

describe('claim replies', () => {
  const drop = { card: { name: 'Power' } } as ActiveDrop;

  it('tells a prefix claimer about the DM in one line, without the card', () => {
    expect(buildPrefixClaimReply(drop, true)).toBe(
      '🎉 You claimed **Power**! The full card is in your DMs.',
    );
    const closed = buildPrefixClaimReply(drop, false);
    expect(closed).toContain('could not DM you');
    expect(closed).toContain('`/cards`');
    expect(closed).not.toContain('\n');
  });

  it('adds the card to the private confirmation only when the DM failed', () => {
    const files = [{ attachment: Buffer.from('png'), name: 'card.png' }];
    const embed = {} as never;
    expect(buildClaimConfirmation(drop, { dmSent: true, embed, files })).toMatchObject({
      embeds: [],
      files: [],
    });
    expect(buildClaimConfirmation(drop, { dmSent: false, embed, files })).toMatchObject({
      embeds: [embed],
      files,
    });
  });
});

describe('scheduleCardDropExpiry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('edits an unclaimed drop to the expired state just after its window', async () => {
    const t = setup();
    const drop = await t.spawn();
    scheduleCardDropExpiry(t.client, drop);

    await vi.advanceTimersByTimeAsync(drop.expiresAt - Date.now());
    expect(t.editMessage).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(t.editMessage).toHaveBeenCalledTimes(1);
    const [messageId, edit] = t.editMessage.mock.calls[0]!;
    expect(messageId).toBe(MESSAGE);
    expect(edit.components).toEqual([]);
    expect(edit.attachments).toEqual([]);
    const embed = edit.embeds[0].toJSON();
    expect(embed.title).toContain('Expired');
    expect(embed.description).toContain('Power');
    expect(embed.image).toBeUndefined();
  });

  it('does nothing when the drop was claimed', async () => {
    const t = setup();
    const drop = await t.spawn();
    scheduleCardDropExpiry(t.client, drop);
    await t.dropManager.claimDrop(drop.id, 'winner');

    await vi.advanceTimersByTimeAsync(drop.expiresAt - Date.now() + 1000);

    expect(t.editMessage).not.toHaveBeenCalled();
  });

  it('logs a failed edit and never throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = setup();
    const drop = await t.spawn();
    t.editMessage.mockRejectedValueOnce(new Error('Unknown Message'));
    scheduleCardDropExpiry(t.client, drop);

    await vi.advanceTimersByTimeAsync(drop.expiresAt - Date.now() + 1000);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Unknown Message'));
    warn.mockRestore();
  });

  it('expires right away when the window already passed while posting', async () => {
    const t = setup();
    const drop = await t.spawn();
    vi.setSystemTime(drop.expiresAt + 5000);
    scheduleCardDropExpiry(t.client, drop);

    await vi.advanceTimersByTimeAsync(1000);

    expect(t.editMessage).toHaveBeenCalledTimes(1);
  });
});
