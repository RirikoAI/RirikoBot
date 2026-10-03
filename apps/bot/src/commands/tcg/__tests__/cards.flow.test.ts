import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  createDatabaseClient,
  WaifuCardRepository,
  WaifuAssetRepository,
  type DatabaseClient,
} from '@ririko/database';
import { createCardsCommand } from '../cards.command.js';
import type { BotServices } from '../../../services.js';

/* /cards against a real in-memory database, driven through a fake message and collector. */

function fakeMessage() {
  const collector = Object.assign(new EventEmitter(), {
    resetTimer: vi.fn(),
  });
  const message = {
    components: [
      {
        type: 1,
        components: [{ type: 2, custom_id: 'cards:next', style: 1, label: 'Next' }],
      },
    ] as unknown[],
    edit: vi.fn().mockResolvedValue(undefined),
    createMessageComponentCollector: vi.fn(() => collector),
  };
  return { message, collector };
}

function interaction(
  customId: string,
  kind: 'button' | 'select',
  extra: Record<string, unknown> = {},
) {
  return {
    customId,
    user: { id: 'owner-1' },
    values: [] as string[],
    isButton: () => kind === 'button',
    isStringSelectMenu: () => kind === 'select',
    reply: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    deferUpdate: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    ...extra,
  };
}

describe('/cards interactive album (TASK-1254)', () => {
  let db: DatabaseClient;
  let cardRepo: WaifuCardRepository;
  let assetRepo: WaifuAssetRepository;
  let services: BotServices;
  let getCardImage: ReturnType<typeof vi.fn>;
  let assetId: string;
  let reply: ReturnType<typeof vi.fn>;
  let message: ReturnType<typeof fakeMessage>['message'];
  let collector: ReturnType<typeof fakeMessage>['collector'];
  let userCards: Array<{ id: string; name: string }>;

  const collect = (i: unknown) =>
    (collector.listeners('collect')[0] as (x: unknown) => Promise<void>)(i);

  async function seedCard(
    name: string,
    opts: {
      element?: string;
      rarity?: string;
      attack?: number;
      level?: number;
      wins?: number;
      userId?: string;
    } = {},
  ) {
    const base = await cardRepo.create({
      assetId,
      name,
      rarity: opts.rarity ?? 'RARE',
      element: opts.element ?? 'FIRE',
      attack: opts.attack ?? 100,
      defense: 100,
      speed: 100,
      health: 1000,
      critRate: 0.1,
      collectionNumber: userCards.length + 1,
    } as any);
    const uc = await cardRepo.createUserCard({
      userId: opts.userId ?? 'owner-1',
      cardId: base.id,
      serialNumber: userCards.length + 1,
      level: opts.level ?? 1,
      exp: 0,
    });
    if (opts.wins) await cardRepo.incrementUserCardBattlesWon(uc.id, opts.wins);
    userCards.push({ id: uc.id, name });
    return uc;
  }

  async function open(options: { filter?: string; sort?: string; page?: number } = {}) {
    ({ message, collector } = fakeMessage());
    reply = vi.fn().mockResolvedValue(message);
    const cmd = createCardsCommand(services);
    await cmd.execute({
      user: { id: 'owner-1', username: 'Subaru' },
      options: {
        getString: vi.fn((k: string) => (options as Record<string, string>)[k] ?? null),
        getInteger: vi.fn((k: string) => (k === 'page' ? (options.page ?? null) : null)),
      },
      reply,
    } as any);
  }

  const listEmbed = () => reply.mock.calls[0]![0].embeds[0].data;

  beforeEach(async () => {
    userCards = [];
    db = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:', autoMigrate: true });
    cardRepo = new WaifuCardRepository(db as never);
    assetRepo = new WaifuAssetRepository(db as never);
    await assetRepo.upsertSource({
      id: 'WAIFU_IM',
      name: 'waifu.im',
      baseUrl: 'https://api.waifu.im',
      attributionText: 'Image source: waifu.im',
      isActive: true,
    });
    const asset = await assetRepo.create({
      sourceId: 'WAIFU_IM',
      sourceImageId: 'img-1',
      characterName: 'Rem',
      animeTitle: 'Re:Zero',
      imageHash: 'hash-1',
      localStoragePath: '/assets/rem.png',
      discordCdnUrl: null,
      tags: [],
      isDeletedByRequest: false,
    });
    assetId = asset.id;
    getCardImage = vi.fn().mockResolvedValue(Buffer.from('png'));
    services = {
      waifuCardRepo: cardRepo,
      waifuAssetRepo: assetRepo,
      cardImageService: { getCardImage },
      loadoutService: {
        getCardLoadout: vi.fn().mockResolvedValue({
          weapon: null,
          armor: null,
          relic: null,
          ring: null,
          amulet: null,
          talisman: null,
          aggregateStats: {},
          activePerks: [],
        }),
      },
    } as unknown as BotServices;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await db.close();
  });

  describe('listing', () => {
    it('sorts by attack by default and lists the equipped vanguard', async () => {
      await seedCard('Weak', { attack: 50 });
      const strong = await seedCard('Strong', { attack: 400 });
      await cardRepo.updateUserCardState(strong.id, 'EQUIPPED');
      await open();

      const embed = listEmbed();
      expect(embed.title).toBe("🎴 Subaru's Waifu Card Album (Page 1/1)");
      expect(embed.description).toContain('**Active Vanguard**: **Strong**');
      expect(embed.description!.indexOf('**Strong**')).toBeLessThan(
        embed.description!.indexOf('**Weak**'),
      );
      expect(embed.footer!.text).toContain('Total Owned: 2');
      const components = reply.mock.calls[0]![0].components;
      expect(components).toHaveLength(2);
      expect(message.createMessageComponentCollector).toHaveBeenCalledWith({ time: 120_000 });
    });

    it.each([
      ['level', ['Hi', 'Mid', 'Lo']],
      ['battles', ['Mid', 'Lo', 'Hi']],
      ['name', ['Hi', 'Lo', 'Mid']],
    ])('sorts by %s', async (sort, expected) => {
      await seedCard('Hi', { level: 30, wins: 0 });
      await seedCard('Mid', { level: 20, wins: 9 });
      await seedCard('Lo', { level: 10, wins: 4 });
      await open({ sort });
      const names = [...listEmbed().description!.matchAll(/\*\*(Hi|Mid|Lo)\*\* \(/g)].map(
        (m) => m[1],
      );
      expect(names).toEqual(expected);
    });

    it('filters by element or rarity and says when nothing matches', async () => {
      await seedCard('Flame', { element: 'FIRE', rarity: 'RARE' });
      await seedCard('Frost', { element: 'ICE', rarity: 'MYTHIC' });
      await open({ filter: 'ice' });
      expect(listEmbed().description).toContain('**Frost**');
      expect(listEmbed().description).not.toContain('**Flame**');
      expect(listEmbed().footer!.text).toContain('Filter: `ICE`');

      await open({ filter: 'RARE' });
      expect(listEmbed().description).toContain('**Flame**');
      expect(listEmbed().description).not.toContain('**Frost**');

      await open({ filter: 'SHADOW' });
      expect(listEmbed().description).toContain('*No cards match the specified filter.*');
      expect(reply.mock.calls[0]![0].components).toHaveLength(1);
    });

    it('opens the requested page and clamps one past the end', async () => {
      for (let i = 0; i < 12; i++)
        await seedCard(`Card ${String(i).padStart(2, '0')}`, { attack: 500 - i });
      await open({ page: 2 });
      expect(listEmbed().title).toContain('Page 2/2');
      expect(listEmbed().description).toContain('Card 10');
      expect(listEmbed().description).not.toContain('Card 00');

      await open({ page: 9 });
      expect(listEmbed().title).toContain('Page 2/2');
    });

    it('skips cards whose base definition is gone', async () => {
      const uc = await seedCard('Ghost');
      await seedCard('Real');
      await cardRepo.createUserCard({
        userId: 'owner-1',
        cardId: 'missing-base',
        serialNumber: 99,
        level: 1,
        exp: 0,
      });
      await open();
      expect(listEmbed().description).toContain('**Real**');
      expect(listEmbed().footer!.text).toContain('Total Owned: 3');
      expect(uc.id).toBeDefined();
    });

    it('stops after the first reply when Discord gives no message to collect from', async () => {
      await seedCard('Solo');
      reply = vi.fn().mockResolvedValue(undefined);
      await createCardsCommand(services).execute({
        user: { id: 'owner-1', username: 'Subaru' },
        options: { getString: () => null, getInteger: () => null },
        reply,
      } as any);
      expect(reply).toHaveBeenCalledTimes(1);
    });

    it('fetches the message from an interaction response', async () => {
      await seedCard('Solo');
      const fetched = fakeMessage();
      reply = vi.fn().mockResolvedValue({ fetch: vi.fn().mockResolvedValue(fetched.message) });
      await createCardsCommand(services).execute({
        user: { id: 'owner-1', username: 'Subaru' },
        options: { getString: () => null, getInteger: () => null },
        reply,
      } as any);
      expect(fetched.message.createMessageComponentCollector).toHaveBeenCalled();
    });
  });

  describe('collector', () => {
    beforeEach(async () => {
      for (let i = 0; i < 12; i++)
        await seedCard(`Card ${String(i).padStart(2, '0')}`, { attack: 500 - i });
      await open();
    });

    it('refuses other users and resets the idle timer for the owner', async () => {
      const intruder = interaction('cards:next', 'button', { user: { id: 'someone' } });
      await collect(intruder);
      expect(intruder.reply).toHaveBeenCalledWith({
        content: '⏳ This is not your card album! Run `/cards` to open your own.',
        ephemeral: true,
      });
      expect(collector.resetTimer).not.toHaveBeenCalled();

      await collect(interaction('cards:next', 'button'));
      expect(collector.resetTimer).toHaveBeenCalledTimes(1);
    });

    it('pages through the album with every navigation button', async () => {
      const titleOf = (i: ReturnType<typeof interaction>) =>
        i.update.mock.calls[0]![0].embeds[0].data.title as string;

      const next = interaction('cards:next', 'button');
      await collect(next);
      expect(titleOf(next)).toContain('Page 2/2');
      expect(next.update.mock.calls[0]![0].files).toEqual([]);

      const prev = interaction('cards:prev', 'button');
      await collect(prev);
      expect(titleOf(prev)).toContain('Page 1/2');

      const last = interaction('cards:last', 'button');
      await collect(last);
      expect(titleOf(last)).toContain('Page 2/2');

      const first = interaction('cards:first', 'button');
      await collect(first);
      expect(titleOf(first)).toContain('Page 1/2');
    });

    it('does not page below the first or beyond the last page', async () => {
      const prev = interaction('cards:prev', 'button');
      await collect(prev);
      expect(prev.update.mock.calls[0]![0].embeds[0].data.title).toContain('Page 1/2');
      await collect(interaction('cards:last', 'button'));
      const next = interaction('cards:next', 'button');
      await collect(next);
      expect(next.update.mock.calls[0]![0].embeds[0].data.title).toContain('Page 2/2');
    });

    it('inspects a selected card with its stats, loadout and rendered image', async () => {
      const target = userCards[0]!;
      const pick = interaction('cards:select', 'select', { values: [`card:${target.id}`] });
      await collect(pick);

      expect(pick.deferUpdate).toHaveBeenCalled();
      const payload = pick.editReply.mock.calls[0]![0];
      expect(payload.embeds[0].data.title).toContain(target.name);
      expect(payload.embeds[0].data.description).toContain('Equipped Combat Gear');
      expect(payload.embeds[0].data.image.url).toBe('attachment://card.png');
      expect(payload.files[0].name).toBe('card.png');
      expect(payload.components[0].components.map((c: any) => c.data.custom_id)).toEqual([
        `cards:equip:${target.id}`,
        `cards:fav:${target.id}`,
        'cards:back',
      ]);
    });

    it('still shows the card when its image cannot be rendered', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      getCardImage.mockRejectedValue(new Error('canvas'));
      const pick = interaction('cards:select', 'select', { values: [`card:${userCards[0]!.id}`] });
      await collect(pick);
      const payload = pick.editReply.mock.calls[0]![0];
      expect(payload.files).toEqual([]);
      expect(payload.embeds[0].data.image).toBeUndefined();
      expect(warn).toHaveBeenCalled();
    });

    it('ignores an empty selection and reports an unknown card', async () => {
      const empty = interaction('cards:select', 'select', { values: [] });
      await collect(empty);
      expect(empty.deferUpdate).toHaveBeenCalled();
      expect(empty.editReply).not.toHaveBeenCalled();

      const unknown = interaction('cards:select', 'select', { values: ['card:nope'] });
      await collect(unknown);
      expect(unknown.reply).toHaveBeenCalledWith({
        content: '❌ Card not found in album.',
        ephemeral: true,
      });
    });

    it('returns from inspection to the list', async () => {
      const back = interaction('cards:back', 'button');
      await collect(back);
      expect(back.update.mock.calls[0]![0].embeds[0].data.title).toContain('Page 1/2');
    });

    it('equips a card, parking the previous vanguard, and persists it', async () => {
      const first = userCards[0]!;
      const second = userCards[1]!;
      await cardRepo.updateUserCardState(first.id, 'EQUIPPED');
      const equip = interaction(`cards:equip:${second.id}`, 'button');
      await collect(equip);

      expect((await cardRepo.findUserCardById(first.id))?.state).toBe('IDLE');
      expect((await cardRepo.findUserCardById(second.id))?.state).toBe('EQUIPPED');
      const payload = equip.editReply.mock.calls[0]![0];
      expect(payload.embeds[0].data.title).toContain('[EQUIPPED]');
      expect(payload.components[0].components[0].data.label).toBe('✅ Currently Equipped');
    });

    it('refuses to equip a card locked in a trade, or one that is not in the album', async () => {
      const locked = userCards[2]!;
      await cardRepo.updateUserCardState(locked.id, 'IN_TRADE');
      await open();
      const refused = interaction(`cards:equip:${locked.id}`, 'button');
      await collect(refused);
      expect(refused.reply).toHaveBeenCalledWith({
        content: '❌ Cannot equip card locked in `IN_TRADE`.',
        ephemeral: true,
      });
      expect((await cardRepo.findUserCardById(locked.id))?.state).toBe('IN_TRADE');

      const unknown = interaction('cards:equip:nope', 'button');
      await collect(unknown);
      expect(unknown.reply).toHaveBeenCalledWith({
        content: '❌ Card not found.',
        ephemeral: true,
      });
    });

    it('toggles favourite on and off in the database', async () => {
      const target = userCards[0]!;
      const fav = interaction(`cards:fav:${target.id}`, 'button');
      await collect(fav);
      expect((await cardRepo.findUserCardById(target.id))?.isFavorite).toBe(true);
      expect(fav.editReply.mock.calls[0]![0].components[0].components[1].data.label).toBe(
        '⭐ Unfavorite',
      );

      await collect(interaction(`cards:fav:${target.id}`, 'button'));
      expect((await cardRepo.findUserCardById(target.id))?.isFavorite).toBe(false);

      const unknown = interaction('cards:fav:nope', 'button');
      await collect(unknown);
      expect(unknown.reply).toHaveBeenCalledWith({
        content: '❌ Card not found.',
        ephemeral: true,
      });
    });

    it('does nothing for a component it does not own', async () => {
      const stray = interaction('other:thing', 'button');
      await collect(stray);
      expect(stray.update).not.toHaveBeenCalled();
      expect(stray.reply).not.toHaveBeenCalled();
    });

    it('disables the album controls when the collector expires', async () => {
      collector.emit('end');
      await vi.waitFor(() => expect(message.edit).toHaveBeenCalled());
      const rows = message.edit.mock.calls[0]![0].components;
      expect(rows[0].components[0].data.disabled).toBe(true);
    });

    it('survives a deleted message on expiry', async () => {
      message.edit.mockRejectedValue(new Error('Unknown Message'));
      collector.emit('end');
      await vi.waitFor(() => expect(message.edit).toHaveBeenCalled());
    });
  });
});
