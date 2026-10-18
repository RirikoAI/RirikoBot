import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  createDatabaseClient,
  DungeonSeasonRepository,
  EconomyRepository,
  GameItemRepository,
  UserDungeonProgressRepository,
  UserInventoryItemRepository,
  WaifuCardRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import { resolveWorkspacePath } from '@ririko/core';
import { CANONICAL_ITEMS } from '../equipment/catalog.js';
import { CRAFTING_RECIPES } from '../equipment/crafting-recipes.js';
import { CraftingService } from '../equipment/crafting.service.js';
import { ItemGrantService } from '../equipment/item-grant.service.js';

describe('Crafting recipe table invariants (TASK-1601)', () => {
  const catalogCodes = new Set(CANONICAL_ITEMS.map((item) => item.code));

  it('has a unique code per recipe', () => {
    const codes = CRAFTING_RECIPES.map((r) => r.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('only outputs and consumes catalog codes that exist', () => {
    for (const recipe of CRAFTING_RECIPES) {
      expect(catalogCodes.has(recipe.outputCode)).toBe(true);
      for (const ingredient of recipe.ingredients ?? []) {
        expect(catalogCodes.has(ingredient.code)).toBe(true);
      }
    }
  });

  it('never makes a boss signature drop craftable', () => {
    const bossFile = resolveWorkspacePath('assets/tcg/catalog/bosses/s1_infernal_crucible.json');
    const raw = JSON.parse(readFileSync(bossFile, 'utf-8')) as {
      bosses: { signatureDropCode?: string }[];
    };
    const signatureDropCodes = new Set(
      raw.bosses.map((b) => b.signatureDropCode).filter((c): c is string => Boolean(c)),
    );
    expect(signatureDropCodes.size).toBeGreaterThan(0);

    for (const recipe of CRAFTING_RECIPES) {
      expect(signatureDropCodes.has(recipe.outputCode)).toBe(false);
    }
  });

  it('prices every recipe with positive dust and credit costs, and positive unlock floors', () => {
    for (const recipe of CRAFTING_RECIPES) {
      expect(recipe.dustCost).toBeGreaterThan(0);
      expect(recipe.creditCost).toBeGreaterThan(0);
      expect(recipe.outputQuantity).toBeGreaterThan(0);
      expect(recipe.unlockFloor).toBeGreaterThan(0);
      for (const ingredient of recipe.ingredients ?? []) {
        expect(ingredient.quantity).toBeGreaterThan(0);
      }
    }
  });
});

describe('CraftingService (TASK-1601)', () => {
  let client: SqliteDatabaseClient;
  let itemRepo: GameItemRepository;
  let inventoryRepo: UserInventoryItemRepository;
  let economyRepo: EconomyRepository;
  let progressRepo: UserDungeonProgressRepository;
  let seasonRepo: DungeonSeasonRepository;
  let cardRepo: WaifuCardRepository;
  let grants: ItemGrantService;
  let crafting: CraftingService;

  const SEASON_ID = 'S1';

  beforeEach(async () => {
    const raw = await createDatabaseClient({
      dialect: 'sqlite',
      url: ':memory:',
      autoMigrate: true,
    });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    client = raw;

    itemRepo = new GameItemRepository(client);
    inventoryRepo = new UserInventoryItemRepository(client);
    economyRepo = new EconomyRepository(client);
    progressRepo = new UserDungeonProgressRepository(client);
    seasonRepo = new DungeonSeasonRepository(client);
    cardRepo = new WaifuCardRepository(client);

    for (const item of CANONICAL_ITEMS) await itemRepo.create(item);
    grants = new ItemGrantService(itemRepo, inventoryRepo);
    crafting = new CraftingService(
      itemRepo,
      inventoryRepo,
      economyRepo,
      progressRepo,
      seasonRepo,
      client,
    );

    await seasonRepo.create({
      id: SEASON_ID,
      name: 'Infernal Crucible',
      description: 'test season',
      isActive: true,
      isTutorial: false,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 90),
    });
  });

  afterEach(async () => {
    await client.close();
  });

  async function catalogId(code: string): Promise<string> {
    const item = await itemRepo.findByCode(code);
    if (!item) throw new Error(`missing ${code}`);
    return item.id;
  }

  async function setHighestFloor(userId: string, floor: number): Promise<void> {
    await progressRepo.getOrCreateProgress(userId, SEASON_ID);
    const progress = await progressRepo.findByUserAndSeason(userId, SEASON_ID);
    await progressRepo.update(progress!.id, { highestClearedFloor: floor });
  }

  async function grantCredits(userId: string, amount: number): Promise<void> {
    await economyRepo.modifyBalance({
      userId,
      walletDelta: amount,
      type: 'TEST_GRANT',
      source: 'TEST',
    });
  }

  it('rejects crafting a recipe locked behind an uncleared floor', async () => {
    await setHighestFloor('u1', 5); // CRAFT_WEAPON_OBSIDIAN_KATANA needs floor 10
    await grants.grant('u1', 'CRAFTING_DUST', 10_000, 'TEST');
    await grantCredits('u1', 100_000);

    await expect(crafting.craft('u1', 'CRAFT_WEAPON_OBSIDIAN_KATANA')).rejects.toThrow(/locked/i);

    expect(await grants.countOwned('u1', 'CRAFTING_DUST')).toBe(10_000);
    expect((await economyRepo.findById('u1'))?.walletBalance).toBe(100_000);
  });

  it('rejects an unaffordable craft (insufficient dust) with no balance change', async () => {
    await setHighestFloor('u1', 10);
    await grantCredits('u1', 100_000);
    // no dust granted

    await expect(crafting.craft('u1', 'CRAFT_WEAPON_OBSIDIAN_KATANA')).rejects.toThrow(
      /Crafting Dust/i,
    );

    expect(await grants.countOwned('u1', 'CRAFTING_DUST')).toBe(0);
    expect((await economyRepo.findById('u1'))?.walletBalance).toBe(100_000);
    expect(await inventoryRepo.findByUser('u1')).toHaveLength(0);
  });

  it('rejects an unaffordable craft (insufficient credits) with no balance change', async () => {
    await setHighestFloor('u1', 10);
    await grants.grant('u1', 'CRAFTING_DUST', 10_000, 'TEST');
    // no credits granted

    await expect(crafting.craft('u1', 'CRAFT_WEAPON_OBSIDIAN_KATANA')).rejects.toThrow(/Credits/i);

    expect(await grants.countOwned('u1', 'CRAFTING_DUST')).toBe(10_000);
    expect((await economyRepo.findById('u1'))?.walletBalance ?? 0).toBe(0);
    const katanaId = await catalogId('WEAPON_OBSIDIAN_KATANA');
    expect(
      (await inventoryRepo.findByUser('u1')).filter((r) => r.itemId === katanaId),
    ).toHaveLength(0);
  });

  it('rejects a craft missing its ingredient, spending nothing', async () => {
    await setHighestFloor('u1', 20);
    await grants.grant('u1', 'CRAFTING_DUST', 10_000, 'TEST');
    await grantCredits('u1', 100_000);
    // CRAFT_ARMOR_DRAGONSCALE_PLATE needs 1x ARMOR_MAGMA_MAIL, which we do not own

    await expect(crafting.craft('u1', 'CRAFT_ARMOR_DRAGONSCALE_PLATE')).rejects.toThrow(
      /Magma-Forged Mail/i,
    );

    expect(await grants.countOwned('u1', 'CRAFTING_DUST')).toBe(10_000);
    expect((await economyRepo.findById('u1'))?.walletBalance).toBe(100_000);
  });

  it('crafts a base-tier recipe, deducting exactly dust and credits and granting the output', async () => {
    await setHighestFloor('u1', 10);
    const recipe = CRAFTING_RECIPES.find((r) => r.code === 'CRAFT_WEAPON_OBSIDIAN_KATANA')!;
    await grants.grant('u1', 'CRAFTING_DUST', recipe.dustCost, 'TEST');
    await grantCredits('u1', recipe.creditCost);

    const receipt = await crafting.craft('u1', 'CRAFT_WEAPON_OBSIDIAN_KATANA');

    expect(receipt.success).toBe(true);
    expect(receipt.dustSpent).toBe(recipe.dustCost);
    expect(receipt.creditsSpent).toBe(recipe.creditCost);
    expect(receipt.inventoryItemIds).toHaveLength(1);

    expect(await grants.countOwned('u1', 'CRAFTING_DUST')).toBe(0);
    expect((await economyRepo.findById('u1'))?.walletBalance).toBe(0);

    const katanaId = await catalogId('WEAPON_OBSIDIAN_KATANA');
    const rows = await inventoryRepo.findByUser('u1');
    expect(rows.filter((r) => r.itemId === katanaId)).toHaveLength(1);
  });

  it('consumes an owned ingredient and grants the upgraded output', async () => {
    await setHighestFloor('u1', 20);
    const recipe = CRAFTING_RECIPES.find((r) => r.code === 'CRAFT_ARMOR_DRAGONSCALE_PLATE')!;
    await grants.grant('u1', 'CRAFTING_DUST', recipe.dustCost, 'TEST');
    await grantCredits('u1', recipe.creditCost);
    await grants.grant('u1', 'ARMOR_MAGMA_MAIL', 1, 'TEST');

    const receipt = await crafting.craft('u1', 'CRAFT_ARMOR_DRAGONSCALE_PLATE');

    expect(receipt.success).toBe(true);
    expect(receipt.ingredientsSpent).toEqual([{ code: 'ARMOR_MAGMA_MAIL', quantity: 1 }]);

    const magmaMailId = await catalogId('ARMOR_MAGMA_MAIL');
    const plateId = await catalogId('ARMOR_DRAGONSCALE_PLATE');
    const rows = await inventoryRepo.findByUser('u1');
    expect(rows.filter((r) => r.itemId === magmaMailId)).toHaveLength(0);
    expect(rows.filter((r) => r.itemId === plateId)).toHaveLength(1);
  });

  it('never consumes an equipped ingredient, only an unequipped copy', async () => {
    await setHighestFloor('u1', 20);
    const recipe = CRAFTING_RECIPES.find((r) => r.code === 'CRAFT_ARMOR_DRAGONSCALE_PLATE')!;
    await grants.grant('u1', 'CRAFTING_DUST', recipe.dustCost, 'TEST');
    await grantCredits('u1', recipe.creditCost);

    const card = await cardRepo.create({
      assetId: 'a1',
      name: 'Test Card',
      rarity: 'RARE',
      element: 'FIRE',
      attack: 1,
      defense: 1,
      speed: 1,
      health: 1,
      collectionNumber: 1,
    });
    const userCard = await cardRepo.createUserCard({
      userId: 'u1',
      cardId: card.id,
      serialNumber: 1,
    });

    // Only one Magma Mail owned, and it's equipped - craft must fail rather than steal it.
    const granted = await grants.grant('u1', 'ARMOR_MAGMA_MAIL', 1, 'TEST');
    await inventoryRepo.equipToCard('u1', granted!.inventoryItems[0]!.id, userCard.id, 'ARMOR');

    await expect(crafting.craft('u1', 'CRAFT_ARMOR_DRAGONSCALE_PLATE')).rejects.toThrow(
      /Magma-Forged Mail/i,
    );

    const equippedRow = await inventoryRepo.findById(granted!.inventoryItems[0]!.id);
    expect(equippedRow?.state).toBe('EQUIPPED');

    // Now grant a second, unequipped copy - craft should succeed and take that one only.
    await grants.grant('u1', 'ARMOR_MAGMA_MAIL', 1, 'TEST');
    const receipt = await crafting.craft('u1', 'CRAFT_ARMOR_DRAGONSCALE_PLATE');
    expect(receipt.success).toBe(true);

    const stillEquipped = await inventoryRepo.findById(granted!.inventoryItems[0]!.id);
    expect(stillEquipped?.state).toBe('EQUIPPED');
    const magmaMailId = await catalogId('ARMOR_MAGMA_MAIL');
    const remainingMagmaMail = (await inventoryRepo.findByUser('u1')).filter(
      (r) => r.itemId === magmaMailId,
    );
    expect(remainingMagmaMail).toHaveLength(1);
    expect(remainingMagmaMail[0]!.state).toBe('EQUIPPED');
  });

  it('rejects a quantity above the equipment cap of 1', async () => {
    await setHighestFloor('u1', 10);
    await grants.grant('u1', 'CRAFTING_DUST', 100_000, 'TEST');
    await grantCredits('u1', 1_000_000);

    await expect(crafting.craft('u1', 'CRAFT_WEAPON_OBSIDIAN_KATANA', 2)).rejects.toThrow(
      /one at a time/i,
    );
  });

  it('rejects a potion quantity above the per-order cap of 10', async () => {
    await setHighestFloor('u1', 5);
    await grants.grant('u1', 'CRAFTING_DUST', 100_000, 'TEST');
    await grantCredits('u1', 1_000_000);
    await grants.grant('u1', 'POTION_MINOR_HP', 33, 'TEST');

    await expect(crafting.craft('u1', 'CRAFT_POTION_MAJOR_HP', 11)).rejects.toThrow(
      /per-order limit/i,
    );
  });

  it('batches a potion craft, scaling dust/credits/ingredients by quantity', async () => {
    await setHighestFloor('u1', 5);
    const recipe = CRAFTING_RECIPES.find((r) => r.code === 'CRAFT_POTION_MAJOR_HP')!;
    await grants.grant('u1', 'CRAFTING_DUST', recipe.dustCost * 3, 'TEST');
    await grantCredits('u1', recipe.creditCost * 3);
    await grants.grant('u1', 'POTION_MINOR_HP', 9, 'TEST');

    const receipt = await crafting.craft('u1', 'CRAFT_POTION_MAJOR_HP', 3);

    expect(receipt.dustSpent).toBe(recipe.dustCost * 3);
    expect(receipt.creditsSpent).toBe(recipe.creditCost * 3);
    expect(receipt.ingredientsSpent).toEqual([{ code: 'POTION_MINOR_HP', quantity: 9 }]);
    expect(await grants.countOwned('u1', 'POTION_MINOR_HP')).toBe(0);
    expect(await grants.countOwned('u1', 'POTION_MAJOR_HP')).toBe(3);
  });

  it('listRecipes reports lock status, affordability and ingredient shortfalls', async () => {
    await setHighestFloor('u1', 10);
    await grants.grant('u1', 'CRAFTING_DUST', 1_000_000, 'TEST');
    await grantCredits('u1', 1_000_000);

    const statuses = await crafting.listRecipes('u1');
    expect(statuses).toHaveLength(CRAFTING_RECIPES.length);

    const katana = statuses.find((s) => s.recipe.code === 'CRAFT_WEAPON_OBSIDIAN_KATANA')!;
    expect(katana.unlocked).toBe(true);
    expect(katana.affordable).toBe(true);

    const solarLance = statuses.find((s) => s.recipe.code === 'CRAFT_WEAPON_SOLAR_LANCE')!;
    expect(solarLance.unlocked).toBe(false); // needs floor 20
    expect(solarLance.affordable).toBe(false);

    const plate = statuses.find((s) => s.recipe.code === 'CRAFT_ARMOR_DRAGONSCALE_PLATE')!;
    expect(plate.ingredients).toEqual([
      expect.objectContaining({ code: 'ARMOR_MAGMA_MAIL', owned: 0, sufficient: false }),
    ]);
  });
});
