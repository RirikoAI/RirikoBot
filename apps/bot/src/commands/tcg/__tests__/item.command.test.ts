import { describe, it, expect, beforeEach } from 'vitest';
import { createCraftCommand, createInventoryCommand, createItemsCommand } from '../item.command.js';
import { createCardCommand, createLoadoutCommand } from '../card.command.js';
import { CommandRegistry } from '@ririko/discord';
import type { BotServices } from '../../../services.js';
import type { CommandContext } from '@ririko/discord';
import type { GameItem, UserInventoryItem } from '@ririko/database';

describe('Item Command Suite (TASK-1032)', () => {
  let services: BotServices;
  let itemsCatalog: Map<string, GameItem>;
  let userInventory: Map<string, UserInventoryItem>;
  let userBalances: Map<string, { walletBalance: string }>;
  let modifiedBalances: any[];
  let cardLookups: string[];
  let bagSlots: any[];
  let bagUseCalls: any[];
  let bagUseResult: any;

  beforeEach(() => {
    itemsCatalog = new Map();
    userInventory = new Map();
    userBalances = new Map();
    modifiedBalances = [];

    // Seed test items
    const sword: GameItem = {
      id: 'item_sword_1',
      code: 'MURAMASA_BLADE',
      name: 'Muramasa Cursed Blade',
      type: 'EQUIPMENT',
      subtype: 'WEAPON',
      rarity: 'RARE',
      baseStats: { attack: 45, critRate: 0.05 },
      battlePerks: ['BLEED_ON_HIT'],
      consumableEffect: {},
      isShopBuyable: true,
      shopPrice: 5000,
      maxDailyPurchases: 5,
      isTradeable: true,
      ownerOverridden: false,
      description: 'A sharp, bloodthirsty blade.',
      createdAt: new Date(),
    };
    itemsCatalog.set(sword.id, sword);

    const potion: GameItem = {
      id: 'item_pot_1',
      code: 'ENERGY_POTION',
      name: 'Energy Elixir',
      type: 'CONSUMABLE',
      subtype: 'ENERGY_POTION',
      rarity: 'UNCOMMON',
      baseStats: { energyRestore: 50 },
      battlePerks: [],
      consumableEffect: {},
      isShopBuyable: true,
      shopPrice: 1000,
      maxDailyPurchases: 3,
      isTradeable: true,
      ownerOverridden: false,
      description: 'Restores 50 daily energy.',
      createdAt: new Date(),
    };
    itemsCatalog.set(potion.id, potion);

    const userSword: UserInventoryItem = {
      id: 'inv_user_sword_1',
      userId: 'user_123',
      itemId: sword.id,
      quantity: 1,
      enhancementLevel: 0,
      equippedToCardId: null,
      slot: 'NONE',
      state: 'IDLE',
      obtainedFrom: 'SHOP',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    userInventory.set(userSword.id, userSword);

    const userPotion: UserInventoryItem = {
      id: 'inv_user_pot_1',
      userId: 'user_123',
      itemId: potion.id,
      quantity: 1,
      enhancementLevel: 0,
      equippedToCardId: null,
      slot: 'NONE',
      state: 'IDLE',
      obtainedFrom: 'SHOP',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    userInventory.set(userPotion.id, userPotion);

    userBalances.set('user_123', { walletBalance: '50000' });

    const mockGameItemRepo = {
      findById: async (id: string) => itemsCatalog.get(id) ?? null,
      findByCode: async (code: string) =>
        Array.from(itemsCatalog.values()).find((i) => i.code === code) ?? null,
      listAll: async () => Array.from(itemsCatalog.values()),
    };

    const mockUserInventoryRepo = {
      findById: async (id: string) => userInventory.get(id) ?? null,
      findByUser: async (userId: string) =>
        Array.from(userInventory.values()).filter((i) => i.userId === userId),
    };

    const mockEconomyRepo = {
      getOrCreateBalance: async (userId: string) =>
        userBalances.get(userId) ?? { walletBalance: '0' },
      modifyBalance: async (params: any) => {
        modifiedBalances.push(params);
        return {
          balance: { walletBalance: '45000' },
          transaction: {},
        };
      },
    };

    cardLookups = [];
    bagUseCalls = [];
    bagUseResult = {
      success: true,
      item: { name: 'Energy Potion' },
      quantityUsed: 1,
      remainingQuantity: 2,
      effectSummary: 'Restored 50 energy',
    };
    const bagItems: Record<string, any> = {
      energy_potion: {
        id: 'bag_energy',
        code: 'energy_potion',
        name: 'Energy Potion',
        rarity: 'UNCOMMON',
        description: 'Restores 50 energy.',
        metadata: { itemType: 'ENERGY_RESTORE' },
      },
      exp_potion: {
        id: 'bag_exp',
        code: 'exp_potion',
        name: 'EXP Potion',
        rarity: 'RARE',
        description: 'Grants XP.',
        metadata: { itemType: 'XP_GRANT' },
      },
      bg_voucher: {
        id: 'bag_voucher',
        code: 'bg_voucher',
        name: 'Background Voucher',
        rarity: 'EPIC',
        description: 'A profile background.',
        metadata: { itemType: 'PROFILE_BG_TOKEN' },
      },
    };
    bagSlots = [
      { itemId: 'bag_energy', quantity: 3, item: bagItems['energy_potion'] },
      { itemId: 'bag_exp', quantity: 1, item: bagItems['exp_potion'] },
      { itemId: 'bag_voucher', quantity: 1, item: bagItems['bg_voucher'] },
    ];
    const mockInventoryService = {
      getUserInventory: async (userId: string) => (userId === 'user_123' ? bagSlots : []),
      getItem: async (ref: string) =>
        Object.values(bagItems).find((i) => i.code === ref.toLowerCase() || i.id === ref) ?? null,
      useItem: async (params: any) => {
        bagUseCalls.push(params);
        return bagUseResult;
      },
    };
    const userCards = new Map([
      ['uc_hero', { id: 'uc_hero', userId: 'user_123', cardId: 'base_hero' }],
    ]);
    const waifuCards = new Map([['base_hero', { id: 'base_hero', name: 'Aria Nightbloom' }]]);

    const mockWaifuCardRepo = {
      listUserCards: async () => [],
      findUserCardById: async (id: string) => {
        cardLookups.push(id);
        return userCards.get(id) ?? null;
      },
      findById: async (id: string) => waifuCards.get(id) ?? null,
    };

    const mockEnhancementService = {
      getDustBalance: async () => 400,
      enhance: async (userId: string, userItemId: string, userCredits: bigint) => {
        const item = userInventory.get(userItemId);
        if (!item) throw new Error('Item not found');
        return {
          previousLevel: 0,
          newLevel: 1,
          dustSpent: 100,
          creditsSpent: 500,
          scaledStats: { attack: 48, critRate: 0.05 },
          scaledPerks: ['BLEED_ON_HIT'],
        };
      },
    };

    const mockConsumableService = {
      useItem: async (userId: string, userItemId: string) => {
        const item = userInventory.get(userItemId);
        if (!item) return { success: false, reason: 'Item not found' };
        if (item.itemId === 'item_pot_1') {
          return {
            success: true,
            type: 'ENERGY',
            restoredAmount: 50,
            userEnergy: 150,
            potsUsedToday: 1,
          };
        }
        return {
          success: true,
          type: 'HP',
          restoredAmount: 100,
          cleansedDebuffs: true,
        };
      },
    };

    const craftingRecipeStatus = {
      recipe: {
        code: 'CRAFT_WEAPON_OBSIDIAN_KATANA',
        outputCode: 'WEAPON_OBSIDIAN_KATANA',
        outputQuantity: 1,
        dustCost: 90,
        creditCost: 3938,
        unlockFloor: 10,
      },
      outputItem: { code: 'WEAPON_OBSIDIAN_KATANA', name: 'Obsidian Katana' } as any,
      unlocked: true,
      requiredFloor: 10,
      userHighestFloor: 12,
      ownedDust: 500,
      ownedCredits: 10000,
      ingredients: [],
      affordable: true,
    };

    const mockCraftingService = {
      listRecipes: async () => [craftingRecipeStatus],
      craft: async (userId: string, recipeCode: string, quantity = 1) => {
        if (recipeCode !== craftingRecipeStatus.recipe.code) {
          throw new Error(`Unknown crafting recipe: ${recipeCode}`);
        }
        return {
          success: true,
          recipeCode,
          outputItem: craftingRecipeStatus.outputItem,
          quantity,
          outputQuantity: quantity,
          dustSpent: 90 * quantity,
          creditsSpent: 3938 * quantity,
          ingredientsSpent: [],
          inventoryItemIds: ['inv_new_1'],
          walletBalanceAfter: 50000 - 3938 * quantity,
        };
      },
    };

    services = {
      gameItemRepo: mockGameItemRepo as any,
      userInventoryItemRepo: mockUserInventoryRepo as any,
      economyRepo: mockEconomyRepo as any,
      waifuCardRepo: mockWaifuCardRepo as any,
      enhancementService: mockEnhancementService as any,
      consumableService: mockConsumableService as any,
      craftingService: mockCraftingService as any,
      inventoryService: mockInventoryService as any,
      energyLifecycleService: {
        getOrReconcileUserEnergy: async () => ({
          currentEnergy: 80,
          maxEnergy: 100,
          bonusEnergy: 10,
          dailyEnergyPotsUsed: 1,
        }),
        rules: async () => ({ dailyPotionLimit: 3 }),
      } as any,
    } as unknown as BotServices;
  });

  function createMockContext(options: {
    subcommand?: string;
    userId?: string;
    args?: Record<string, unknown>;
    rawArgs?: string[];
    invokedName?: string;
    target?: { id: string; username: string };
    message?: boolean;
  }): {
    ctx: CommandContext;
    replies: any[];
    press: (i: any) => Promise<any[]>;
    ended: () => Promise<void>;
    edits: any[];
  } {
    const replies: any[] = [];
    const userId = options.userId ?? 'user_123';

    const handlers: Record<string, (i: any) => Promise<void>> = {};
    const edits: any[] = [];
    const fakeMessage = {
      createMessageComponentCollector: () => ({
        on: (event: string, fn: (i: any) => Promise<void>) => {
          handlers[event] = fn;
        },
        stop: () => {},
      }),
      edit: async (payload: any) => {
        edits.push(payload);
      },
    };

    const ctx: Partial<CommandContext> = {
      invokedName: options.invokedName ?? 'items',
      user: { id: userId, username: 'Player1' } as any,
      guild: { id: 'guild_1', name: 'Anime Guild' } as any,
      options: {
        getSubcommand: () => options.subcommand ?? '',
        getRawArgs: () => options.rawArgs ?? (options.subcommand ? [options.subcommand] : []),
        getString: (name: string) => {
          if (name === 'action') return options.subcommand;
          return options.args?.[name] as string | undefined;
        },
        getInteger: (name: string) => options.args?.[name] as number | undefined,
        getBoolean: (name: string) => options.args?.[name] as boolean | undefined,
        getUser: async () => options.target ?? null,
      } as any,
      reply: async (payload: any) => {
        replies.push(payload);
        return (options.message ? fakeMessage : {}) as any;
      },
    };

    const press = async (spec: any) => {
      const updates: any[] = [];
      const interaction = {
        user: { id: spec.userId ?? userId },
        customId: spec.customId,
        values: spec.values ?? [],
        isStringSelectMenu: () => spec.kind === 'select',
        isButton: () => spec.kind !== 'select',
        update: async (payload: any) => {
          updates.push(payload);
        },
        deferUpdate: async () => {},
        reply: async (payload: any) => {
          updates.push({ replied: payload });
        },
      };
      await handlers['collect']!(interaction);
      return updates;
    };

    return {
      ctx: ctx as CommandContext,
      replies,
      press,
      ended: async () => {
        await handlers['end']!({});
      },
      edits,
    };
  }

  describe('Enhance Subcommand', () => {
    it('prompts when item ID is missing', async () => {
      const command = createItemsCommand(services);
      const { ctx, replies } = createMockContext({
        subcommand: 'enhance',
      });

      await command.execute(ctx);

      expect(replies).toHaveLength(1);
      expect(replies[0].content).toContain('Please specify the inventory item ID');
    });

    it('enhances an item from +0 to +1 and charges credits', async () => {
      const command = createItemsCommand(services);
      const { ctx, replies } = createMockContext({
        subcommand: 'enhance',
        args: { item: 'inv_user_sword_1' },
      });

      await command.execute(ctx);

      expect(replies).toHaveLength(1);
      const embed = replies[0].embeds[0];
      expect(embed.data.title).toContain('+0 ➜ +1');
      expect(embed.data.description).toContain('Muramasa Cursed Blade');
      expect(embed.data.description).toContain('500 credits');
      expect(embed.data.description).toContain('100 Dust` (400 left)');
      expect(modifiedBalances).toHaveLength(1);
      expect(modifiedBalances[0].walletDelta).toBe(-500);
      expect(modifiedBalances[0].type).toBe('ENHANCE_ITEM');
    });
  });

  describe('View', () => {
    const buttonIds = (components: any[]) =>
      components.flatMap((row) => row.components.map((c: any) => c.data.custom_id));

    it('opens an overview with energy, potions, dust and a count per category', async () => {
      const { ctx, replies } = createMockContext({});
      await createItemsCommand(services).execute(ctx);

      const embed = replies[0].embeds[0].data;
      expect(embed.title).toContain('Overview');
      expect(embed.description).toContain('80/110');
      expect(embed.description).toContain('1/3');
      expect(embed.description).toContain('Crafting Dust**: `400`');
      expect(embed.description).toContain('Energy: `2`');
      expect(embed.description).toContain('Equipment: `1`');
      expect(buttonIds(replies[0].components)).toEqual(['items:category', 'items:craft']);
    });

    it('still opens when the energy and dust figures cannot be read', async () => {
      (services as any).energyLifecycleService = undefined;
      (services as any).enhancementService.getDustBalance = async () => {
        throw new Error('down');
      };
      const { ctx, replies } = createMockContext({});
      await createItemsCommand(services).execute(ctx);

      const description = replies[0].embeds[0].data.description as string;
      expect(description).not.toContain('Crafting Dust');
      expect(description).toContain('Items per category');
    });

    it('opens the category from the slash option and shows item IDs and details', async () => {
      const { ctx, replies } = createMockContext({ args: { category: 'equipment' } });
      await createItemsCommand(services).execute(ctx);

      const description = replies[0].embeds[0].data.description as string;
      expect(replies[0].embeds[0].data.title).toContain('Equipment (1)');
      expect(description).toContain('Muramasa Cursed Blade');
      expect(description).toContain('ID: `inv_user_sword_1`');
      expect(description).toContain('Perk: BLEED_ON_HIT');
      expect(buttonIds(replies[0].components)).toEqual([
        'items:category',
        'items:item',
        'items:enhance',
        'items:craft',
      ]);
    });

    it('reads a category word from the prefix arguments, with or without the view word', async () => {
      for (const rawArgs of [['energy'], ['view', 'energy'], ['inv', 'energy']]) {
        const { ctx, replies } = createMockContext({ rawArgs });
        await createItemsCommand(services).execute(ctx);
        expect(replies[0].embeds[0].data.title).toContain('Energy (2)');
      }
    });

    it('lists TCG energy potions and bag energy items together, with Use for both', async () => {
      const { ctx, replies } = createMockContext({ args: { category: 'energy' } });
      await createItemsCommand(services).execute(ctx);

      const description = replies[0].embeds[0].data.description as string;
      expect(description).toContain('Energy Elixir');
      expect(description).toContain('Energy Potion');
      expect(buttonIds(replies[0].components)).toContain('items:use');
    });

    it('shows an empty category and the bag items that are not energy items', async () => {
      const { ctx, replies } = createMockContext({ args: { category: 'materials' } });
      await createItemsCommand(services).execute(ctx);
      expect(replies[0].embeds[0].data.description).toContain('Nothing here yet');

      const bag = createMockContext({ args: { category: 'bag' } });
      await createItemsCommand(services).execute(bag.ctx);
      const description = bag.replies[0].embeds[0].data.description as string;
      expect(description).toContain('EXP Potion');
      expect(description).toContain('Background Voucher');
    });

    it('/inventory runs the same view with the economy aliases', async () => {
      const command = createInventoryCommand(services);
      expect(command.metadata.name).toBe('inventory');
      expect(command.metadata.aliases).toEqual(['inv', 'bag']);
      const { ctx, replies } = createMockContext({ invokedName: 'inventory' });
      await command.execute(ctx);
      expect(replies[0].embeds[0].data.title).toContain('Overview');
    });

    it('names the card that wears each worn piece, looking the card up once', async () => {
      const sword = userInventory.get('inv_user_sword_1')!;
      userInventory.set(sword.id, {
        ...sword,
        state: 'EQUIPPED',
        slot: 'WEAPON',
        equippedToCardId: 'uc_hero',
      });
      userInventory.set('inv_user_armor_1', {
        ...sword,
        id: 'inv_user_armor_1',
        state: 'EQUIPPED',
        slot: 'ARMOR',
        equippedToCardId: 'uc_hero',
      });
      const { ctx, replies } = createMockContext({ args: { category: 'equipment' } });
      await createItemsCommand(services).execute(ctx);

      const description = replies[0].embeds[0].data.description as string;
      expect(description).toContain('[EQUIPPED: WEAPON on Aria Nightbloom]');
      expect(description).toContain('[EQUIPPED: ARMOR on Aria Nightbloom]');
      expect(cardLookups.filter((id) => id === 'uc_hero')).toHaveLength(1);
    });

    it('falls back to the card ID when the card wearing a piece cannot be found', async () => {
      const sword = userInventory.get('inv_user_sword_1')!;
      userInventory.set(sword.id, {
        ...sword,
        state: 'EQUIPPED',
        slot: 'WEAPON',
        equippedToCardId: 'uc_gone',
      });
      const { ctx, replies } = createMockContext({ args: { category: 'equipment' } });
      await createItemsCommand(services).execute(ctx);
      expect(replies[0].embeds[0].data.description).toContain('[EQUIPPED: WEAPON on uc_gone]');
    });

    it('keeps the embed within Discord limits with 25 long lines on a page', async () => {
      const sword = userInventory.get('inv_user_sword_1')!;
      const swordDef = itemsCatalog.get('item_sword_1')!;
      itemsCatalog.set('item_long', {
        ...swordDef,
        id: 'item_long',
        code: 'LONG_RELIC',
        name: 'L'.repeat(80),
        description: 'D'.repeat(200),
      });
      for (let i = 0; i < 40; i++) {
        const id = `inv-${'0'.repeat(30)}${String(i).padStart(2, '0')}`;
        userInventory.set(id, {
          ...sword,
          id,
          itemId: 'item_long',
          enhancementLevel: 5,
          state: 'EQUIPPED',
          slot: 'ARMOR',
          equippedToCardId: 'uc_hero',
        });
      }
      const { ctx, replies } = createMockContext({ args: { category: 'equipment' } });
      await createItemsCommand(services).execute(ctx);

      const description = replies[0].embeds[0].data.description as string;
      expect(description.length).toBeLessThanOrEqual(4096);
      const options = replies[0].components[1].components[0].options;
      expect(options).toHaveLength(25);
    });
  });

  describe('View components', () => {
    it('switches category and item through the menus', async () => {
      const { ctx, press } = createMockContext({ message: true });
      await createItemsCommand(services).execute(ctx);

      const [afterCategory] = await press({
        kind: 'select',
        customId: 'items:category',
        values: ['EQUIPMENT'],
      });
      expect(afterCategory.embeds[0].data.title).toContain('Equipment');

      const [afterItem] = await press({
        kind: 'select',
        customId: 'items:item',
        values: ['tcg:inv_user_sword_1'],
      });
      expect(afterItem.embeds[0].data.description).toContain('Muramasa Cursed Blade');
    });

    it('ignores a category that does not exist', async () => {
      const { ctx, press } = createMockContext({ message: true });
      await createItemsCommand(services).execute(ctx);
      const [update] = await press({
        kind: 'select',
        customId: 'items:category',
        values: ['NOPE'],
      });
      expect(update.embeds[0].data.title).toContain('Overview');
    });

    it('answers someone else with a not-your-inventory reply', async () => {
      const { ctx, press } = createMockContext({ message: true });
      await createItemsCommand(services).execute(ctx);
      const [reply] = await press({
        kind: 'select',
        customId: 'items:category',
        values: ['ENERGY'],
        userId: 'intruder',
      });
      expect(reply.replied.content).toContain('not your inventory');
    });

    it('pages through more than 25 items with Previous and Next', async () => {
      const sword = userInventory.get('inv_user_sword_1')!;
      for (let i = 0; i < 29; i++) {
        userInventory.set(`inv_extra_${i}`, { ...sword, id: `inv_extra_${i}` });
      }
      const { ctx, press, replies } = createMockContext({
        message: true,
        args: { category: 'equipment' },
      });
      await createItemsCommand(services).execute(ctx);
      expect(replies[0].embeds[0].data.footer.text).toContain('Page 1/2');

      const [next] = await press({ kind: 'button', customId: 'items:next' });
      expect(next.embeds[0].data.footer.text).toContain('Page 2/2');
      expect(next.components[1].components[0].options).toHaveLength(5);

      const [prev] = await press({ kind: 'button', customId: 'items:prev' });
      expect(prev.embeds[0].data.footer.text).toContain('Page 1/2');
    });

    it('uses a TCG energy potion with the Use button and refreshes the view', async () => {
      const { ctx, press } = createMockContext({ message: true, args: { category: 'energy' } });
      await createItemsCommand(services).execute(ctx);
      const [update] = await press({
        kind: 'select',
        customId: 'items:item',
        values: ['tcg:inv_user_pot_1'],
      });
      expect(update).toBeDefined();

      const [used] = await press({ kind: 'button', customId: 'items:use' });
      expect(used.embeds[0].data.description).toContain('Energy Replenished');
      expect(used.embeds[0].data.description).toContain('+50 energy');
    });

    it('uses a bag item through the inventory service with the server ID', async () => {
      const { ctx, press } = createMockContext({ message: true, args: { category: 'energy' } });
      await createItemsCommand(services).execute(ctx);
      await press({ kind: 'select', customId: 'items:item', values: ['bag:bag_energy'] });

      const [used] = await press({ kind: 'button', customId: 'items:use' });
      expect(bagUseCalls).toEqual([
        { userId: 'user_123', itemId: 'bag_energy', quantity: 1, guildId: 'guild_1' },
      ]);
      expect(used.embeds[0].data.description).toContain('Consumed 1x Energy Potion');
    });

    it('shows a use failure as a notice', async () => {
      bagUseResult = {
        success: false,
        reason: 'Daily limit reached',
        quantityUsed: 0,
        remainingQuantity: 3,
      };
      const { ctx, press } = createMockContext({ message: true, args: { category: 'energy' } });
      await createItemsCommand(services).execute(ctx);
      await press({ kind: 'select', customId: 'items:item', values: ['bag:bag_energy'] });
      const [used] = await press({ kind: 'button', customId: 'items:use' });
      expect(used.embeds[0].data.description).toContain('Daily limit reached');
    });

    it('gives HP potions and the profile voucher no Use button and says why', async () => {
      const potion = userInventory.get('inv_user_pot_1')!;
      itemsCatalog.set('item_hp', {
        ...itemsCatalog.get('item_pot_1')!,
        id: 'item_hp',
        code: 'POTION_MINOR_HP',
        name: 'Minor HP Potion',
        subtype: 'HP_POTION',
      });
      userInventory.set('inv_hp', { ...potion, id: 'inv_hp', itemId: 'item_hp' });

      const hp = createMockContext({ args: { category: 'potions' } });
      await createItemsCommand(services).execute(hp.ctx);
      const hpIds = hp.replies[0].components.flatMap((r: any) =>
        r.components.map((c: any) => c.data.custom_id),
      );
      expect(hpIds).not.toContain('items:use');
      expect(hp.replies[0].embeds[0].data.description).toContain('used in battle');

      const bag = createMockContext({ message: true, args: { category: 'bag' } });
      await createItemsCommand(services).execute(bag.ctx);
      const [update] = await bag.press({
        kind: 'select',
        customId: 'items:item',
        values: ['bag:bag_voucher'],
      });
      const ids = update.components.flatMap((r: any) =>
        r.components.map((c: any) => c.data.custom_id),
      );
      expect(ids).not.toContain('items:use');
      expect(update.embeds[0].data.description).toContain('/profile background');
    });

    it('enhances gear with the Enhance button', async () => {
      const { ctx, press } = createMockContext({ message: true, args: { category: 'equipment' } });
      await createItemsCommand(services).execute(ctx);
      const [update] = await press({ kind: 'button', customId: 'items:enhance' });
      expect(update.embeds[0].data.description).toContain('Enhancement Succeeded');
      expect(modifiedBalances).toHaveLength(1);
    });

    it('shows an enhancement failure as a notice', async () => {
      (services as any).enhancementService.enhance = async () => {
        throw new Error('Not enough dust');
      };
      const { ctx, press } = createMockContext({ message: true, args: { category: 'equipment' } });
      await createItemsCommand(services).execute(ctx);
      const [update] = await press({ kind: 'button', customId: 'items:enhance' });
      expect(update.embeds[0].data.description).toContain('Not enough dust');
    });

    it('opens the crafting menu with the Craft button', async () => {
      const { ctx, press, replies } = createMockContext({ message: true });
      await createItemsCommand(services).execute(ctx);
      await press({ kind: 'button', customId: 'items:craft' });
      expect(replies[1].embeds[0].data.title).toContain('Crafting Workshop');
    });

    it('shows a thrown error as a notice', async () => {
      (services as any).inventoryService.useItem = async () => {
        throw new Error('boom');
      };
      const { ctx, press } = createMockContext({ message: true, args: { category: 'energy' } });
      await createItemsCommand(services).execute(ctx);
      await press({ kind: 'select', customId: 'items:item', values: ['bag:bag_energy'] });
      const [used] = await press({ kind: 'button', customId: 'items:use' });
      expect(used.embeds[0].data.description).toContain('boom');
    });

    it('is read-only when viewing another member', async () => {
      const { ctx, replies, press } = createMockContext({
        message: true,
        args: { category: 'equipment' },
        target: { id: 'user_123_other', username: 'Other' },
      });
      await createItemsCommand(services).execute(ctx);
      const ids = replies[0].components.flatMap((r: any) =>
        r.components.map((c: any) => c.data.custom_id),
      );
      expect(ids).toEqual(['items:category']);
      expect(replies[0].embeds[0].data.title).toContain("Other's Items");

      const [update] = await press({ kind: 'button', customId: 'items:enhance' });
      expect(update.embeds[0].data.title).toContain("Other's Items");
      expect(modifiedBalances).toHaveLength(0);
    });

    it('disables the components when the collector ends', async () => {
      const { ctx, ended, edits } = createMockContext({
        message: true,
        args: { category: 'equipment' },
      });
      await createItemsCommand(services).execute(ctx);
      await ended();
      const all = edits[0].components.flatMap((r: any) => r.components);
      expect(all.length).toBeGreaterThan(0);
      expect(all.every((c: any) => c.data.disabled === true)).toBe(true);
    });
  });

  describe('Use action', () => {
    it('prompts when the item is missing', async () => {
      const { ctx, replies } = createMockContext({ subcommand: 'use' });
      await createItemsCommand(services).execute(ctx);
      expect(replies[0].content).toContain('Please say which item to use');
    });

    it('uses a TCG item by inventory ID', async () => {
      const { ctx, replies } = createMockContext({
        subcommand: 'use',
        args: { item: 'inv_user_pot_1' },
      });
      await createItemsCommand(services).execute(ctx);
      expect(replies[0].content).toContain('Energy Replenished');
      expect(replies[0].content).toContain('+50 energy');
    });

    it('uses a TCG item by code, case-insensitively', async () => {
      const { ctx, replies } = createMockContext({
        subcommand: 'use',
        args: { item: 'energy_potion' },
      });
      await createItemsCommand(services).execute(ctx);
      expect(replies[0].content).toContain('Energy Replenished');
    });

    it('uses a TCG item by legacy alias', async () => {
      itemsCatalog.set('item_flask', {
        ...itemsCatalog.get('item_pot_1')!,
        id: 'item_flask',
        code: 'RESTORE_GRAND_ENERGY_FLASK',
      });
      userInventory.set('inv_flask', {
        ...userInventory.get('inv_user_pot_1')!,
        id: 'inv_flask',
        itemId: 'item_flask',
      });
      const { ctx, replies } = createMockContext({
        subcommand: 'use',
        args: { item: 'potion_energy_grand' },
      });
      await createItemsCommand(services).execute(ctx);
      expect(replies[0].content).toContain('Used 1');
    });

    it('uses a bag item by code with a quantity', async () => {
      const { ctx, replies } = createMockContext({
        subcommand: 'use',
        args: { item: 'exp_potion', quantity: 2 },
      });
      await createItemsCommand(services).execute(ctx);
      expect(bagUseCalls).toEqual([
        { userId: 'user_123', itemId: 'bag_exp', quantity: 2, guildId: 'guild_1' },
      ]);
      expect(replies[0].content).toContain('Consumed 1x Energy Potion');
    });

    it('answers a bag use failure with its reason', async () => {
      bagUseResult = { success: false, reason: 'Nope', quantityUsed: 0, remainingQuantity: 0 };
      const { ctx, replies } = createMockContext({
        subcommand: 'use',
        args: { item: 'exp_potion' },
      });
      await createItemsCommand(services).execute(ctx);
      expect(replies[0].content).toContain('Cannot Use Item');
      expect(replies[0].content).toContain('Nope');
    });

    it('uses TCG potions one at a time and stops at the first failure', async () => {
      let calls = 0;
      (services as any).consumableService.useItem = async () => {
        calls += 1;
        return calls <= 2
          ? {
              success: true,
              type: 'ENERGY',
              restoredAmount: 50,
              userEnergy: 100,
              potsUsedToday: calls,
            }
          : { success: false, type: 'ENERGY', restoredAmount: 0, reason: 'Daily limit reached' };
      };
      const { ctx, replies } = createMockContext({
        subcommand: 'use',
        args: { item: 'inv_user_pot_1', quantity: 5 },
      });
      await createItemsCommand(services).execute(ctx);
      expect(calls).toBe(3);
      expect(replies[0].content).toContain('Used 2');
      expect(replies[0].content).toContain('+100 energy');
      expect(replies[0].content).toContain('Daily limit reached');
    });

    it('reports a service error from a TCG potion', async () => {
      (services as any).consumableService.useItem = async () => {
        throw new Error('You do not have any more of this item');
      };
      const { ctx, replies } = createMockContext({
        subcommand: 'use',
        args: { item: 'inv_user_pot_1' },
      });
      await createItemsCommand(services).execute(ctx);
      expect(replies[0].content).toContain('You do not have any more of this item');
    });

    it('reports a potion that heals a card', async () => {
      (services as any).consumableService.useItem = async () => ({
        success: true,
        type: 'HP',
        restoredAmount: 100,
        cleansedDebuffs: true,
      });
      const { ctx, replies } = createMockContext({
        subcommand: 'use',
        args: { item: 'inv_user_pot_1' },
      });
      await createItemsCommand(services).execute(ctx);
      expect(replies[0].content).toContain('restored +100 HP');
      expect(replies[0].content).toContain('cleansed');
    });

    it('replies clearly for an unknown item', async () => {
      const { ctx, replies } = createMockContext({ subcommand: 'use', args: { item: 'ghost' } });
      await createItemsCommand(services).execute(ctx);
      expect(replies[0].content).toContain('Unknown item');
    });

    it('reports an unexpected error', async () => {
      (services as any).inventoryService.getItem = async () => {
        throw new Error('db down');
      };
      const { ctx, replies } = createMockContext({ subcommand: 'use', args: { item: 'ghost' } });
      await createItemsCommand(services).execute(ctx);
      expect(replies[0].content).toContain('db down');
    });

    it.each(['use', 'consume'])('reads `!%s <item> <quantity>` as a use', async (invokedName) => {
      const { ctx } = createMockContext({ invokedName, rawArgs: ['exp_potion', '2'] });
      await createItemsCommand(services).execute(ctx);
      expect(bagUseCalls[0]).toMatchObject({ itemId: 'bag_exp', quantity: 2 });
    });

    it('reads `!items use <item>` from the prefix arguments', async () => {
      const { ctx, replies } = createMockContext({ rawArgs: ['consume', 'inv_user_pot_1'] });
      await createItemsCommand(services).execute(ctx);
      expect(replies[0].content).toContain('Energy Replenished');
    });
  });

  describe('Craft Subcommand', () => {
    it('opens the interactive crafting menu when no recipe is given (slash)', async () => {
      const command = createItemsCommand(services);
      const { ctx, replies } = createMockContext({
        subcommand: 'craft',
      });

      await command.execute(ctx);

      expect(replies).toHaveLength(1);
      const embed = replies[0].embeds[0];
      expect(embed.data.title).toContain('Crafting Workshop');
      expect(replies[0].components.length).toBeGreaterThan(0);
    });

    it('opens the interactive crafting menu when no recipe is given (prefix)', async () => {
      const command = createItemsCommand(services);
      const { ctx, replies } = createMockContext({
        rawArgs: ['craft'],
      });

      await command.execute(ctx);

      expect(replies).toHaveLength(1);
      expect(replies[0].embeds[0].data.title).toContain('Crafting Workshop');
    });

    it('crafts directly by recipe code and shows a receipt embed (slash)', async () => {
      const command = createItemsCommand(services);
      const { ctx, replies } = createMockContext({
        subcommand: 'craft',
        args: { recipe: 'CRAFT_WEAPON_OBSIDIAN_KATANA' },
      });

      await command.execute(ctx);

      expect(replies).toHaveLength(1);
      const embed = replies[0].embeds[0];
      expect(embed.data.title).toContain('Crafted 1x Obsidian Katana');
      expect(embed.data.description).toContain('90 Dust');
      expect(embed.data.description).toContain('3938 credits');
      expect(embed.data.description).toContain('400 left');
    });

    it('crafts directly by recipe code (prefix) and resolves the output-item code fallback', async () => {
      const command = createItemsCommand(services);
      const { ctx, replies } = createMockContext({
        rawArgs: ['craft', 'weapon_obsidian_katana'],
      });

      await command.execute(ctx);

      expect(replies).toHaveLength(1);
      const embed = replies[0].embeds[0];
      expect(embed.data.title).toContain('Crafted 1x Obsidian Katana');
    });

    it('respects an explicit quantity', async () => {
      const command = createItemsCommand(services);
      const { ctx, replies } = createMockContext({
        subcommand: 'craft',
        args: { recipe: 'CRAFT_WEAPON_OBSIDIAN_KATANA', quantity: 2 },
      });

      await command.execute(ctx);

      const embed = replies[0].embeds[0];
      expect(embed.data.title).toContain('Crafted 2x Obsidian Katana');
      expect(embed.data.description).toContain('180 Dust');
    });

    it('shows an error message for an unknown recipe code', async () => {
      const command = createItemsCommand(services);
      const { ctx, replies } = createMockContext({
        subcommand: 'craft',
        args: { recipe: 'NOT_A_REAL_RECIPE' },
      });

      await command.execute(ctx);

      expect(replies).toHaveLength(1);
      expect(replies[0].content).toContain('Unknown crafting recipe');
    });

    it('renders a service error (e.g. locked/insufficient) as an error message', async () => {
      services.craftingService.craft = async () => {
        throw new Error(
          'Insufficient Crafting Dust! Required: 90 Dust, but you only have 10 Dust.',
        );
      };
      const command = createItemsCommand(services);
      const { ctx, replies } = createMockContext({
        subcommand: 'craft',
        args: { recipe: 'CRAFT_WEAPON_OBSIDIAN_KATANA' },
      });

      await command.execute(ctx);

      expect(replies).toHaveLength(1);
      expect(replies[0].content).toContain('Crafting Failed');
      expect(replies[0].content).toContain('Insufficient Crafting Dust');
    });
  });

  describe('Standalone /craft and /loadout shortcuts', () => {
    it('/craft with no recipe opens the crafting menu', async () => {
      const command = createCraftCommand(services);
      const { ctx, replies } = createMockContext({ rawArgs: [] });

      await command.execute(ctx);

      expect(replies[0].embeds[0].data.title).toContain('Crafting Workshop');
    });

    it('/craft crafts directly from slash options', async () => {
      const command = createCraftCommand(services);
      const { ctx, replies } = createMockContext({
        args: { recipe: 'CRAFT_WEAPON_OBSIDIAN_KATANA', quantity: 2 },
        rawArgs: [],
      });

      await command.execute(ctx);

      expect(replies[0].embeds[0].data.title).toContain('Crafted 2x Obsidian Katana');
    });

    it('prefix `forge <recipe> <quantity>` reads the recipe from the first argument', async () => {
      const command = createCraftCommand(services);
      const { ctx, replies } = createMockContext({ rawArgs: ['weapon_obsidian_katana', '2'] });

      await command.execute(ctx);

      expect(replies[0].embeds[0].data.title).toContain('Crafted 2x Obsidian Katana');
    });

    it('registers craft/forge and loadout/gear/equipment without alias collisions', () => {
      const registry = new CommandRegistry().registerAll([
        createCardCommand(services),
        createItemsCommand(services),
        createCraftCommand(services),
        createLoadoutCommand(services),
      ]);

      expect(registry.get('forge')?.metadata.name).toBe('craft');
      expect(registry.get('gear')?.metadata.name).toBe('loadout');
      expect(registry.get('equipment')?.metadata.name).toBe('loadout');
      expect(registry.get('item')?.metadata.name).toBe('items');
      expect(registry.get('use')?.metadata.name).toBe('items');
    });
  });
});
