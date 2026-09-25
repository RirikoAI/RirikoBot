import { describe, it, expect, beforeEach } from 'vitest';
import { createCraftCommand, createItemCommand } from '../item.command.js';
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
      description: 'A sharp, bloodthirsty blade.',
      createdAt: new Date(),
    };
    itemsCatalog.set(sword.id, sword);

    const potion: GameItem = {
      id: 'item_pot_1',
      code: 'STAMINA_POTION',
      name: 'Stamina Elixir',
      type: 'CONSUMABLE',
      subtype: 'POTION',
      rarity: 'UNCOMMON',
      baseStats: { energyRestore: 50 },
      battlePerks: [],
      consumableEffect: {},
      isShopBuyable: true,
      shopPrice: 1000,
      maxDailyPurchases: 3,
      isTradeable: true,
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

    const mockWaifuCardRepo = {
      listUserCards: async () => [],
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
    } as unknown as BotServices;
  });

  function createMockContext(options: {
    subcommand?: string;
    userId?: string;
    args?: Record<string, unknown>;
    rawArgs?: string[];
  }): { ctx: CommandContext; replies: any[] } {
    const replies: any[] = [];
    const userId = options.userId ?? 'user_123';

    const ctx: Partial<CommandContext> = {
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
      } as any,
      reply: async (payload: any) => {
        replies.push(payload);
        return {} as any;
      },
    };

    return { ctx: ctx as CommandContext, replies };
  }

  describe('Inventory Subcommand', () => {
    it('displays inventory with equipment and consumables', async () => {
      const command = createItemCommand(services);
      const { ctx, replies } = createMockContext({
        subcommand: 'inventory',
      });

      await command.execute(ctx);

      expect(replies).toHaveLength(1);
      const embed = replies[0].embeds[0];
      expect(embed.data.title).toContain('Gear & Consumables');
      expect(embed.data.description).toContain('Muramasa Cursed Blade');
      expect(embed.data.description).toContain('Stamina Elixir');
    });

    it('filters inventory by item type', async () => {
      const command = createItemCommand(services);
      const { ctx, replies } = createMockContext({
        subcommand: 'inventory',
        args: { filter: 'CONSUMABLE' },
      });

      await command.execute(ctx);

      expect(replies).toHaveLength(1);
      const embed = replies[0].embeds[0];
      expect(embed.data.description).toContain('Stamina Elixir');
      expect(embed.data.description).not.toContain('Muramasa Cursed Blade');
    });

    it('returns empty inventory notice when player has no items', async () => {
      const command = createItemCommand(services);
      const { ctx, replies } = createMockContext({
        subcommand: 'inventory',
        userId: 'empty_user',
      });

      await command.execute(ctx);

      expect(replies).toHaveLength(1);
      const embed = replies[0].embeds[0];
      expect(embed.data.description).toContain('empty');
    });
  });

  describe('Enhance Subcommand', () => {
    it('prompts when item ID is missing', async () => {
      const command = createItemCommand(services);
      const { ctx, replies } = createMockContext({
        subcommand: 'enhance',
      });

      await command.execute(ctx);

      expect(replies).toHaveLength(1);
      expect(replies[0].content).toContain('Please specify the inventory item ID');
    });

    it('enhances an item from +0 to +1 and charges credits', async () => {
      const command = createItemCommand(services);
      const { ctx, replies } = createMockContext({
        subcommand: 'enhance',
        args: { id: 'inv_user_sword_1' },
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

  describe('Use Subcommand', () => {
    it('prompts when item ID is missing', async () => {
      const command = createItemCommand(services);
      const { ctx, replies } = createMockContext({
        subcommand: 'use',
      });

      await command.execute(ctx);

      expect(replies).toHaveLength(1);
      expect(replies[0].content).toContain('Please specify the inventory item ID to consume');
    });

    it('consumes stamina potion and shows restored energy', async () => {
      const command = createItemCommand(services);
      const { ctx, replies } = createMockContext({
        subcommand: 'use',
        args: { id: 'inv_user_pot_1' },
      });

      await command.execute(ctx);

      expect(replies).toHaveLength(1);
      const embed = replies[0].embeds[0];
      expect(embed.data.title).toContain('Stamina Replenished');
      expect(embed.data.description).toContain('+50 Energy');
      expect(embed.data.description).toContain('1 / 3');
    });
  });

  describe('Craft Subcommand', () => {
    it('opens the interactive crafting menu when no recipe is given (slash)', async () => {
      const command = createItemCommand(services);
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
      const command = createItemCommand(services);
      const { ctx, replies } = createMockContext({
        rawArgs: ['craft'],
      });

      await command.execute(ctx);

      expect(replies).toHaveLength(1);
      expect(replies[0].embeds[0].data.title).toContain('Crafting Workshop');
    });

    it('crafts directly by recipe code and shows a receipt embed (slash)', async () => {
      const command = createItemCommand(services);
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
      const command = createItemCommand(services);
      const { ctx, replies } = createMockContext({
        rawArgs: ['craft', 'weapon_obsidian_katana'],
      });

      await command.execute(ctx);

      expect(replies).toHaveLength(1);
      const embed = replies[0].embeds[0];
      expect(embed.data.title).toContain('Crafted 1x Obsidian Katana');
    });

    it('respects an explicit quantity', async () => {
      const command = createItemCommand(services);
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
      const command = createItemCommand(services);
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
      const command = createItemCommand(services);
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
        createItemCommand(services),
        createCraftCommand(services),
        createLoadoutCommand(services),
      ]);

      expect(registry.get('forge')?.metadata.name).toBe('craft');
      expect(registry.get('gear')?.metadata.name).toBe('loadout');
      expect(registry.get('equipment')?.metadata.name).toBe('loadout');
      expect(registry.get('items')?.metadata.name).toBe('item');
    });
  });
});
