import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createDatabaseClient,
  WaifuCardRepository,
  WaifuAssetRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import {
  createCardsCommand,
  buildCardListEmbed,
  buildCardListComponents,
  buildCardInspectEmbed,
  buildCardInspectComponents,
  type PopulatedUserCard,
} from '../cards.command.js';
import type { BotServices } from '../../../services.js';
import { CommandRegistry, type CommandContext } from '@ririko/discord';
import { StringSelectMenuBuilder, ButtonBuilder } from 'discord.js';
import { createCardCommand } from '../card.command.js';

describe('Cards Command Suite (TASK-1044)', () => {
  let client: SqliteDatabaseClient;
  let cardRepo: WaifuCardRepository;
  let assetRepo: WaifuAssetRepository;
  let services: BotServices;
  let getCardImage: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const rawClient = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:' });
    if (rawClient.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = rawClient;

    client.raw.exec(`
      CREATE TABLE waifu_sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        attribution_text TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE waifu_assets (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        source_image_id TEXT NOT NULL,
        character_name TEXT NOT NULL,
        anime_title TEXT NOT NULL,
        image_hash TEXT NOT NULL UNIQUE,
        local_storage_path TEXT,
        discord_cdn_url TEXT,
        is_deleted_by_request INTEGER NOT NULL DEFAULT 0,
        tags TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL
      );

      CREATE TABLE waifu_cards (
        id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL,
        name TEXT NOT NULL,
        rarity TEXT NOT NULL,
        element TEXT NOT NULL,
        attack INTEGER NOT NULL,
        defense INTEGER NOT NULL,
        speed INTEGER NOT NULL,
        health INTEGER NOT NULL,
        crit_rate REAL NOT NULL DEFAULT 0.05,
        skill_name TEXT,
        skill_description TEXT,
        passive_name TEXT,
        passive_description TEXT,
        collection_number INTEGER NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE user_cards (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        card_id TEXT NOT NULL,
        serial_number INTEGER NOT NULL,
        level INTEGER NOT NULL DEFAULT 1,
        exp INTEGER NOT NULL DEFAULT 0,
        battles_won INTEGER NOT NULL DEFAULT 0,
        state TEXT NOT NULL DEFAULT 'IDLE',
        is_favorite INTEGER NOT NULL DEFAULT 0,
        obtained_at INTEGER NOT NULL
      );
    `);

    cardRepo = new WaifuCardRepository(client);
    assetRepo = new WaifuAssetRepository(client);

    await assetRepo.upsertSource({
      id: 'WAIFU_IM',
      name: 'waifu.im',
      baseUrl: 'https://api.waifu.im',
      attributionText: 'Image source: waifu.im',
      isActive: true,
    });

    await assetRepo.create({
      sourceId: 'WAIFU_IM',
      sourceImageId: 'asset_rem_tcg',
      characterName: 'Rem',
      animeTitle: 'Re:Zero',
      imageHash: 'rem_hash',
      localStoragePath: '/assets/rem.png',
      discordCdnUrl: null,
      tags: ['rem', 'maid', 'ice'],
      isDeletedByRequest: false,
    });

    getCardImage = vi.fn().mockResolvedValue(Buffer.from('fake_card_png'));

    const mockLoadoutService = {
      getCardLoadout: async (_cardId: string) => ({
        weapon: {
          inventoryItem: { id: 'inv_weapon_1', enhancementLevel: 2 },
          item: { name: 'Morningstar' },
        },
        armor: null,
        relic: null,
        ring: null,
        amulet: null,
        talisman: null,
        aggregateStats: { attack: 40 },
        activePerks: ['CRUSHING_BLOW'],
      }),
    };

    services = {
      waifuCardRepo: cardRepo,
      waifuAssetRepo: assetRepo,
      cardImageService: { getCardImage } as any,
      loadoutService: mockLoadoutService as any,
    } as unknown as BotServices;
  });

  afterEach(async () => {
    await client.close();
  });

  it('registers correct metadata and options for /cards', () => {
    const cmd = createCardsCommand(services);
    expect(cmd.metadata.name).toBe('cards');
    expect(cmd.metadata.aliases).toContain('album');
    expect(cmd.metadata.aliases).toContain('mycards');
    expect(cmd.metadata.options?.some((o) => o.name === 'filter')).toBe(true);
    expect(cmd.metadata.options?.some((o) => o.name === 'sort')).toBe(true);
    expect(cmd.metadata.options?.some((o) => o.name === 'page')).toBe(true);
  });

  it('registers both createCardCommand and createCardsCommand without alias collision', () => {
    const registry = new CommandRegistry();
    expect(() => {
      registry.register(createCardCommand(services));
      registry.register(createCardsCommand(services));
    }).not.toThrow();
  });

  it('replies with empty notice when user has no cards', async () => {
    const cmd = createCardsCommand(services);
    const replyFn = vi.fn();
    const ctx = {
      user: { id: 'user_empty', username: 'Summoner' },
      options: {
        getString: vi.fn().mockReturnValue(null),
        getInteger: vi.fn().mockReturnValue(null),
      },
      reply: replyFn,
    } as unknown as CommandContext;

    await cmd.execute(ctx);
    expect(replyFn).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('Your card album is currently empty!'),
        ephemeral: true,
      }),
    );
  });

  it('builds card list embed and pagination components correctly', async () => {
    const baseCard = await cardRepo.create({
      assetId: (await assetRepo.findByImageHash('rem_hash'))!.id,
      name: 'Rem (Demon Maid)',
      rarity: 'MYTHIC',
      element: 'ICE',
      attack: 300,
      defense: 250,
      speed: 140,
      health: 2200,
      critRate: 0.15,
      collectionNumber: 1,
      skillName: 'Al Huma',
      skillDescription: 'Deals massive Ice damage.',
      passiveName: 'Demon Horn',
      passiveDescription: 'Boosts ATK when HP drops below 50%.',
    });

    const userCard = await cardRepo.createUserCard({
      userId: 'user_1',
      cardId: baseCard.id,
      serialNumber: 1,
      level: 15,
      exp: 420,
    });
    await cardRepo.incrementUserCardBattlesWon(userCard.id, 7);
    const updatedUc = (await cardRepo.findUserCardById(userCard.id))!;

    const populated: PopulatedUserCard[] = [
      {
        userCard: updatedUc,
        base: baseCard,
        asset: null,
      },
    ];

    // Embed check
    const embed = buildCardListEmbed('Subaru', populated, 1, 1, 1);
    const json = embed.toJSON();
    expect(json.title).toContain("Subaru's Waifu Card Album (Page 1/1)");
    expect(json.description).toContain('Rem (Demon Maid)');
    expect(json.description).toContain('7** Wins');
    expect(json.description).toContain('Lv.15');

    // Components check
    const rows = buildCardListComponents(populated, 1, 1);
    expect(rows).toHaveLength(2);

    // Row 0: StringSelectMenuBuilder
    const selectMenu = rows[0]?.components[0] as StringSelectMenuBuilder;
    expect(selectMenu).toBeDefined();
    expect(selectMenu.data.custom_id).toBe('cards:select');
    expect(selectMenu.options).toHaveLength(1);
    expect(selectMenu.options[0]?.data.label).toContain('Rem (Demon Maid)');
    expect(selectMenu.options[0]?.data.value).toBe(`card:${userCard.id}`);

    // Row 1: Pagination Buttons
    const buttons = rows[1]?.components as ButtonBuilder[];
    expect(buttons).toHaveLength(5);
    expect((buttons[0]?.data as any).custom_id).toBe('cards:first');
    expect((buttons[1]?.data as any).custom_id).toBe('cards:prev');
    expect((buttons[2]?.data as any).label).toBe('1 / 1');
    expect((buttons[3]?.data as any).custom_id).toBe('cards:next');
    expect((buttons[4]?.data as any).custom_id).toBe('cards:last');
  });

  it('builds card inspect embed with battles won, exp bar, scaled stats, skills, and loadout', async () => {
    const baseCard = await cardRepo.create({
      assetId: (await assetRepo.findByImageHash('rem_hash'))!.id,
      name: 'Rem (Demon Maid)',
      rarity: 'MYTHIC',
      element: 'ICE',
      attack: 300,
      defense: 250,
      speed: 140,
      health: 2200,
      critRate: 0.15,
      collectionNumber: 1,
      skillName: 'Al Huma',
      skillDescription: 'Deals massive Ice damage.',
      passiveName: 'Demon Horn',
      passiveDescription: 'Boosts ATK when HP drops below 50%.',
    });

    const userCard = await cardRepo.createUserCard({
      userId: 'user_1',
      cardId: baseCard.id,
      serialNumber: 1,
      level: 10,
      exp: 150,
    });
    await cardRepo.incrementUserCardBattlesWon(userCard.id, 25);
    const updatedUc = (await cardRepo.findUserCardById(userCard.id))!;

    const item: PopulatedUserCard = {
      userCard: updatedUc,
      base: baseCard,
      asset: null,
    };

    const { embed, files } = await buildCardInspectEmbed(services, item);
    const json = embed.toJSON();

    expect(json.title).toContain('Rem (Demon Maid)');
    expect(json.description).toContain('25** victories');
    expect(json.description).toContain('Level**: `10 / 100`');
    expect(json.description).toContain('EXP**');
    expect(json.description).toContain('Al Huma');
    expect(json.description).toContain('Demon Horn');
    expect(json.description).toContain('**Morningstar** +2');
    expect(json.description).toContain('CRUSHING_BLOW');
    expect(files).toHaveLength(1);
    expect(files[0]?.name).toBe('card.png');
  });

  it('builds inspect components with active equip button when card is idle', () => {
    const userCard = {
      id: 'uc_test_1',
      userId: 'user_1',
      cardId: 'base_1',
      serialNumber: 1,
      level: 5,
      exp: 20,
      battlesWon: 3,
      state: 'IDLE',
      isFavorite: false,
      obtainedAt: new Date(),
    };

    const rows = buildCardInspectComponents(userCard);
    expect(rows).toHaveLength(1);
    const buttons = rows[0]?.components as ButtonBuilder[];
    expect(buttons).toHaveLength(3);

    // Equip button
    expect((buttons[0]?.data as any).custom_id).toBe('cards:equip:uc_test_1');
    expect((buttons[0]?.data as any).label).toBe('⚔️ Equip Vanguard');
    expect((buttons[0]?.data as any).disabled).toBeFalsy();

    // Favorite button
    expect((buttons[1]?.data as any).custom_id).toBe('cards:fav:uc_test_1');
    expect((buttons[1]?.data as any).label).toBe('⭐ Favorite');

    // Back button
    expect((buttons[2]?.data as any).custom_id).toBe('cards:back');
    expect((buttons[2]?.data as any).label).toBe('◀️ Back to Cards List');
  });

  it('disables equip button when card is already equipped or in trade/market', () => {
    const equippedCard = {
      id: 'uc_equipped',
      userId: 'user_1',
      cardId: 'base_1',
      serialNumber: 1,
      level: 5,
      exp: 20,
      battlesWon: 3,
      state: 'EQUIPPED',
      isFavorite: true,
      obtainedAt: new Date(),
    };

    const rowsEquipped = buildCardInspectComponents(equippedCard);
    const btnEquipped = rowsEquipped[0]?.components[0] as ButtonBuilder;
    expect((btnEquipped.data as any).label).toBe('✅ Currently Equipped');
    expect(btnEquipped.data.disabled).toBe(true);

    const lockedCard = {
      id: 'uc_locked',
      userId: 'user_1',
      cardId: 'base_1',
      serialNumber: 1,
      level: 5,
      exp: 20,
      battlesWon: 3,
      state: 'IN_TRADE',
      isFavorite: false,
      obtainedAt: new Date(),
    };

    const rowsLocked = buildCardInspectComponents(lockedCard);
    const btnLocked = rowsLocked[0]?.components[0] as ButtonBuilder;
    expect((btnLocked.data as any).label).toContain('Locked (IN_TRADE)');
    expect(btnLocked.data.disabled).toBe(true);
  });
});
