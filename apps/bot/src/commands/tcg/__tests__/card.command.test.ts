import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createDatabaseClient,
  WaifuCardRepository,
  WaifuAssetRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import { DropManager } from '@ririko/services';
import { CardDismantleService } from '@ririko/services';
import { createCardCommand } from '../card.command.js';
import type { BotServices } from '../../../services.js';
import type { CommandContext } from '@ririko/discord';

describe('Card Command Suite (TASK-1012)', () => {
  let client: SqliteDatabaseClient;
  let cardRepo: WaifuCardRepository;
  let assetRepo: WaifuAssetRepository;
  let dropManager: DropManager;
  let dismantleService: CardDismantleService;
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
      sourceImageId: 'asset_rias_tcg',
      characterName: 'Rias Gremory',
      animeTitle: 'High School DxD',
      imageHash: 'rias_gremory_hash',
      localStoragePath: '/assets/rias.png',
      discordCdnUrl: null,
      tags: ['rias', 'devil', 'fire'],
      isDeletedByRequest: false,
    });

    dropManager = new DropManager(cardRepo, assetRepo);
    dismantleService = new CardDismantleService(cardRepo);

    const mockLoadoutService = {
      getCardLoadout: async (cardId: string) => ({
        weapon: {
          inventoryItem: { id: 'inv_weapon_1', enhancementLevel: 3 },
          item: { name: 'Dragon Slayer' },
        },
        armor: null,
        relic: null,
        ring: null,
        amulet: null,
        talisman: null,
        aggregateStats: { attack: 75 },
        activePerks: ['CRIT_BONUS_T1'],
      }),
      equip: async (userId: string, cardId: string, itemId: string, slot: string) => ({
        loadout: {},
        unequippedItemName: undefined,
      }),
      unequip: async (userId: string, itemId: string) => ({
        unequippedItemName: 'Dragon Slayer',
      }),
    };

    getCardImage = vi.fn(async () => Buffer.from('rendered-card-png'));

    services = {
      cardImageService: { getCardImage } as any,
      waifuAssetRepo: assetRepo,
      waifuCardRepo: cardRepo,
      dropManager,
      dismantleService,
      loadoutService: mockLoadoutService as any,
    } as unknown as BotServices;
  });

  afterEach(async () => {
    await client.close();
  });

  function createMockContext(options: {
    subcommand: string;
    userId?: string;
    guildId?: string;
    args?: Record<string, unknown>;
  }): { ctx: CommandContext; replies: any[] } {
    const replies: any[] = [];
    const userId = options.userId ?? 'user_commander_1';
    const guildId = options.guildId ?? 'guild_tcg_1';

    const ctx: Partial<CommandContext> = {
      user: { id: userId, username: 'Commander' } as any,
      guild: { id: guildId, name: 'Anime Guild' } as any,
      options: {
        getSubcommand: () => options.subcommand,
        getRawArgs: () => [options.subcommand],
        getString: (name: string, required?: boolean) => {
          if (name === 'action' && options.args?.['action'] === undefined) {
            return options.subcommand;
          }
          const val = options.args?.[name];
          if (required && val === undefined) throw new Error(`Missing ${name}`);
          return (val as string) ?? null;
        },
        getUser: async () => null,
      } as any,
      reply: async (msg) => {
        replies.push(msg);
        return {} as any;
      },
    };

    return { ctx: ctx as CommandContext, replies };
  }

  it('should handle /card claim when active drop exists', async () => {
    const command = createCardCommand(services);
    const guildId = 'guild_tcg_1';

    // No active drop initially
    const { ctx: ctxEmpty, replies: repliesEmpty } = createMockContext({
      subcommand: 'claim',
      guildId,
    });
    await command.execute(ctxEmpty);
    expect(repliesEmpty[0].content).toContain('no active card drop');

    // Spawn drop
    const drop = await dropManager.spawnDrop(guildId, 'channel_main');
    expect(drop).not.toBeNull();

    // Claim active drop
    const { ctx: ctxClaim, replies: repliesClaim } = createMockContext({
      subcommand: 'claim',
      guildId,
      userId: 'user_lucky',
    });
    await command.execute(ctxClaim);
    expect(repliesClaim[0].embeds).toHaveLength(1);
    expect(repliesClaim[0].embeds[0].data.title).toContain('Card Claimed: Rias Gremory');
    expect(repliesClaim[0].embeds[0].data.footer?.text).toContain('Image source: waifu.im');
    expect(repliesClaim[0].embeds[0].data.image?.url).toBe('attachment://card.png');
    expect(repliesClaim[0].files).toEqual([
      { attachment: Buffer.from('rendered-card-png'), name: 'card.png' },
    ]);
    expect(getCardImage).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Rias Gremory' }),
      expect.objectContaining({ characterName: 'Rias Gremory' }),
      expect.objectContaining({ attributionText: 'Image source: waifu.im' }),
    );
  });

  it('should handle /card collection, inspect, favorite, equip, and dismantle', async () => {
    const command = createCardCommand(services);
    const userId = 'user_trainer';

    // 1. Initial collection (empty)
    const { ctx: ctxEmpty, replies: repEmpty } = createMockContext({
      subcommand: 'collection',
      userId,
    });
    await command.execute(ctxEmpty);
    expect(repEmpty[0].content).toContain('empty');

    // Create a base card and user card
    const card = await cardRepo.create({
      assetId: 'asset_rias_tcg',
      name: 'Rias Gremory',
      rarity: 'MYTHIC',
      element: 'FIRE',
      attack: 1800,
      defense: 1200,
      speed: 210,
      health: 9500,
      critRate: 0.25,
      skillName: 'Extinction Ray',
      skillDescription: 'Deals 250% Fire damage.',
      passiveName: 'Crimson Ruin',
      passiveDescription: '+20% Fire ATK.',
      collectionNumber: 1,
      isActive: true,
    });

    const userCard = await cardRepo.createUserCard({
      userId,
      cardId: card.id,
      serialNumber: 42,
      level: 5,
      exp: 100,
      state: 'IDLE',
      isFavorite: false,
    });

    // 2. Collection with 1 card
    const { ctx: ctxColl, replies: repColl } = createMockContext({
      subcommand: 'collection',
      userId,
    });
    await command.execute(ctxColl);
    expect(repColl[0].embeds).toHaveLength(1);
    expect(repColl[0].embeds[0].data.description).toContain('Rias Gremory');
    expect(repColl[0].embeds[0].data.description).toContain('#0042/1000');

    // 3. Inspect card
    const { ctx: ctxInsp, replies: repInsp } = createMockContext({
      subcommand: 'inspect',
      userId,
      args: { id: userCard.id },
    });
    await command.execute(ctxInsp);
    expect(repInsp[0].embeds).toHaveLength(1);
    expect(repInsp[0].embeds[0].data.title).toContain('Rias Gremory (#0042/1000)');
    expect(repInsp[0].embeds[0].data.description).toContain('Extinction Ray');
    expect(repInsp[0].embeds[0].data.footer?.text).toContain('Image source: waifu.im');
    expect(repInsp[0].embeds[0].data.image?.url).toBe('attachment://card.png');
    expect(repInsp[0].files).toHaveLength(1);

    // 4. Favorite card
    const { ctx: ctxFav, replies: repFav } = createMockContext({
      subcommand: 'favorite',
      userId,
      args: { id: userCard.id },
    });
    await command.execute(ctxFav);
    expect(repFav[0].content).toContain('protected from accidental dismantling');

    // 5. Attempt dismantle while favorited (must fail)
    const { ctx: ctxDisFail, replies: repDisFail } = createMockContext({
      subcommand: 'dismantle',
      userId,
      args: { id: userCard.id },
    });
    await command.execute(ctxDisFail);
    expect(repDisFail[0].content).toContain('favorite');

    // 6. Unfavorite
    const { ctx: ctxUnfav } = createMockContext({
      subcommand: 'favorite',
      userId,
      args: { id: userCard.id },
    });
    await command.execute(ctxUnfav);

    // 7. Equip card
    const { ctx: ctxEq, replies: repEq } = createMockContext({
      subcommand: 'equip',
      userId,
      args: { id: userCard.id },
    });
    await command.execute(ctxEq);
    expect(repEq[0].content).toContain('equipped as your active combat vanguard');

    // 8. Attempt dismantle while EQUIPPED (must fail)
    const { ctx: ctxDisEqFail, replies: repDisEqFail } = createMockContext({
      subcommand: 'dismantle',
      userId,
      args: { id: userCard.id },
    });
    await command.execute(ctxDisEqFail);
    expect(repDisEqFail[0].content).toContain('EQUIPPED');

    // 9. Reset state to IDLE and successfully dismantle
    await cardRepo.updateUserCardState(userCard.id, 'IDLE');
    const { ctx: ctxDisOk, replies: repDisOk } = createMockContext({
      subcommand: 'dismantle',
      userId,
      args: { id: userCard.id },
    });
    await command.execute(ctxDisOk);
    expect(repDisOk[0].content).toContain('10000 Crafting Dust');
  });

  it('should inspect 6-slot loadout, equip gear, and unequip gear', async () => {
    const command = createCardCommand(services);
    const userId = 'user_loadout_test';

    const baseCard = await cardRepo.create({
      assetId: 'asset_rias_tcg',
      name: 'Rias Gremory',
      rarity: 'MYTHIC',
      element: 'FIRE',
      attack: 1000,
      defense: 500,
      speed: 120,
      health: 5000,
      critRate: 0.2,
      skillName: 'Extinction Ray',
      passiveName: 'Devil Royalty',
      collectionNumber: 99,
      isActive: true,
    });

    const userCard = await cardRepo.createUserCard({
      userId,
      cardId: baseCard.id,
      serialNumber: 1,
      level: 50,
      exp: 0,
      isFavorite: false,
      state: 'EQUIPPED',
    });

    // 1. Inspect loadout
    const { ctx: ctxLoadout, replies: repLoadout } = createMockContext({
      subcommand: 'loadout',
      userId,
      args: { id: userCard.id },
    });
    await command.execute(ctxLoadout);
    expect(repLoadout[0].embeds).toHaveLength(1);
    expect(repLoadout[0].embeds[0].data.title).toContain('6-Slot Combat Loadout');
    expect(repLoadout[0].embeds[0].data.description).toContain('Dragon Slayer');
    expect(repLoadout[0].embeds[0].data.description).toContain('+3');
    expect(repLoadout[0].embeds[0].data.description).toContain('+75');

    // 2. Equip gear piece
    const { ctx: ctxEquipGear, replies: repEquipGear } = createMockContext({
      subcommand: 'equip-gear',
      userId,
      args: { id: userCard.id, item_id: 'inv_weapon_1', slot: 'WEAPON' },
    });
    await command.execute(ctxEquipGear);
    expect(repEquipGear[0].content).toContain('Successfully equipped gear piece into the **WEAPON** slot');

    // 3. Unequip gear piece
    const { ctx: ctxUnequipGear, replies: repUnequipGear } = createMockContext({
      subcommand: 'unequip-gear',
      userId,
      args: { item_id: 'inv_weapon_1' },
    });
    await command.execute(ctxUnequipGear);
    expect(repUnequipGear[0].content).toContain('Unequipped **Dragon Slayer**');
  });
  it('still replies with the text embed when card rendering fails', async () => {
    getCardImage.mockRejectedValueOnce(new Error('canvas exploded'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const command = createCardCommand(services);
    await dropManager.spawnDrop('guild_tcg_1', 'channel_main');

    const { ctx, replies } = createMockContext({ subcommand: 'claim', userId: 'user_unlucky' });
    await command.execute(ctx);

    expect(replies[0].embeds[0].data.title).toContain('Card Claimed');
    expect(replies[0].embeds[0].data.image).toBeUndefined();
    expect(replies[0].files).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
