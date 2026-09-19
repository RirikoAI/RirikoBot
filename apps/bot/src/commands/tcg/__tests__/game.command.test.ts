import { describe, it, expect, beforeEach } from 'vitest';
import { createGameCommand } from '../game.command.js';
import type { BotServices } from '../../../services.js';
import type { CommandContext } from '@ririko/discord';
import {
  CombatSimulator,
  ExpeditionService,
  BossRaidService,
  PvPDuelService,
  QuestService,
  LoadoutService,
} from '@ririko/services';

describe('Game Command Suite (TASK-1022)', () => {
  let services: BotServices;
  let userEnergyMap: Map<string, number>;
  let userCardsMap: Map<string, any[]>;
  let baseCardsMap: Map<string, any>;

  beforeEach(() => {
    userEnergyMap = new Map();
    userCardsMap = new Map();
    baseCardsMap = new Map();

    const mockEnergyRepo = {
      consumeEnergy: async (userId: string, amount: number) => {
        const curr = userEnergyMap.get(userId) ?? 100;
        if (curr < amount) {
          return { success: false, currentEnergy: curr, reason: 'Insufficient energy' };
        }
        const updated = curr - amount;
        userEnergyMap.set(userId, updated);
        return { success: true, currentEnergy: updated };
      },
    };

    const mockCardRepo = {
      listUserCards: async (userId: string, options?: { state?: string; limit?: number }) => {
        const cards = userCardsMap.get(userId) ?? [];
        if (options?.state) {
          return cards.filter((c) => c.state === options.state);
        }
        if (options?.limit) {
          return cards.slice(0, options.limit);
        }
        return cards;
      },
      findById: async (cardId: string) => {
        return baseCardsMap.get(cardId) ?? null;
      },
    };

    const combatSimulator = new CombatSimulator({ rng: () => 0.5 });
    const expeditionService = new ExpeditionService(mockEnergyRepo as any);
    const bossRaidService = new BossRaidService(mockEnergyRepo as any, combatSimulator);
    const pvpDuelService = new PvPDuelService(mockEnergyRepo as any, undefined, combatSimulator);
    const questService = new QuestService();
    const mockTcgShopService = {
      getCatalog: async (category?: string) => [
        {
          id: 'shop_pot_1',
          code: 'STAMINA_POTION',
          name: 'Stamina Elixir',
          category: 'POTION',
          rarity: 'UNCOMMON',
          shopPrice: 1000,
          maxDailyPurchases: 3,
          description: 'Restores 50 daily energy.',
          battlePerks: [],
        },
      ],
      buyItem: async (userId: string, itemCode: string, quantity: number, guildId?: string) => {
        if (itemCode === 'INVALID') throw new Error('Item not found in shop');
        return {
          item: { name: 'Stamina Elixir', code: 'STAMINA_POTION' },
          quantity,
          totalPrice: 1000 * quantity,
          walletBalanceAfter: 49000,
        };
      },
    };

    const mockLoadoutService = {
      getCardLoadout: async () => ({
        aggregateStats: {},
        activePerks: [],
      }),
      applyLoadoutToCombatant: () => {},
      cardRepo: mockCardRepo,
      buildCombatant: LoadoutService.prototype.buildCombatant,
      buildActiveParty: LoadoutService.prototype.buildActiveParty,
    };

    services = {
      playerEnergyRepo: mockEnergyRepo as any,
      waifuCardRepo: mockCardRepo as any,
      combatSimulator,
      expeditionService,
      bossRaidService,
      pvpDuelService,
      questService,
      tcgShopService: mockTcgShopService as any,
      loadoutService: mockLoadoutService as any,
    } as unknown as BotServices;
  });

  function createMockContext(options: {
    action?: string;
    subaction?: string;
    duration?: string;
    quest_id?: string;
    user?: any;
    wager?: number;
    item?: string;
    quantity?: number;
    userId?: string;
    rawArgs?: string[];
  }): { ctx: CommandContext; replies: any[] } {
    const replies: any[] = [];
    const userId = options.userId ?? 'user_commander_1';

    const ctx: Partial<CommandContext> = {
      user: { id: userId, username: 'Commander' } as any,
      options: {
        getRawArgs: () => options.rawArgs ?? (options.action ? [options.action] : []),
        getString: (name: string) => {
          if (name === 'action') return options.action ?? null;
          if (name === 'subaction') return options.subaction ?? null;
          if (name === 'duration') return options.duration ?? null;
          if (name === 'quest_id') return options.quest_id ?? null;
          if (name === 'item') return options.item ?? null;
          return null;
        },
        getInteger: (name: string) => {
          if (name === 'wager') return options.wager ?? null;
          if (name === 'quantity') return options.quantity ?? null;
          return null;
        },
        getUser: async (name: string) => {
          if (name === 'user') return options.user ?? null;
          return null;
        },
      } as any,
      reply: async (msg) => {
        replies.push(msg);
        return {} as any;
      },
    };

    return { ctx: ctx as CommandContext, replies };
  }

  it('should handle /game quests (list & claim)', async () => {
    const command = createGameCommand(services);

    // List quests
    const { ctx: ctxList, replies: repliesList } = createMockContext({ action: 'quests' });
    await command.execute(ctxList);

    expect(repliesList).toHaveLength(1);
    expect(repliesList[0].embeds).toHaveLength(1);
    expect(repliesList[0].embeds[0].data.title).toContain('Missions');

    // Claim incomplete quest should fail
    const { ctx: ctxClaimFail, replies: repliesClaimFail } = createMockContext({
      action: 'quests',
      subaction: 'claim',
      quest_id: 'daily_pvp_win',
    });
    await command.execute(ctxClaimFail);
    expect(repliesClaimFail[0].content).toContain('is not completed yet');

    // Complete quest and claim
    services.questService.recordProgress('user_commander_1', 'daily_pvp_win', 1);

    const { ctx: ctxClaimSuccess, replies: repliesClaimSuccess } = createMockContext({
      action: 'quests',
      subaction: 'claim',
      quest_id: 'daily_pvp_win',
    });
    await command.execute(ctxClaimSuccess);
    expect(repliesClaimSuccess[0].content).toContain('Quest Claimed');
  });

  it('should handle /game explore (start & status)', async () => {
    const command = createGameCommand(services);

    // Set card for user
    userCardsMap.set('user_commander_1', [{ id: 'uc_1', cardId: 'base_1', level: 1 }]);

    // Deploy expedition
    const { ctx: ctxStart, replies: repliesStart } = createMockContext({
      action: 'explore',
      subaction: 'start',
      duration: '1h',
    });
    await command.execute(ctxStart);
    expect(repliesStart[0].content).toContain('Expedition Deployed');
    expect(repliesStart[0].content).toContain('10 Energy');

    // Check status
    const { ctx: ctxStatus, replies: repliesStatus } = createMockContext({
      action: 'explore',
      subaction: 'status',
    });
    await command.execute(ctxStatus);
    expect(repliesStatus[0].content).toContain('Your Timed Expeditions');
    expect(repliesStatus[0].content).toContain('1h');
  });

  it('should handle /game boss (status & attack)', async () => {
    const command = createGameCommand(services);

    // Check status
    const { ctx: ctxStatus, replies: repliesStatus } = createMockContext({
      action: 'boss',
      subaction: 'status',
    });
    await command.execute(ctxStatus);
    expect(repliesStatus[0].embeds).toHaveLength(1);
    expect(repliesStatus[0].embeds[0].data.title).toContain('World Boss');

    // Equip card for attack
    baseCardsMap.set('base_hero', {
      id: 'base_hero',
      name: 'Rias Gremory',
      element: 'FIRE',
      health: 3000,
      attack: 600,
      defense: 200,
      speed: 100,
      critRate: 0.1,
    });
    userCardsMap.set('user_commander_1', [
      { id: 'uc_hero', cardId: 'base_hero', level: 10, state: 'EQUIPPED' },
    ]);

    // Attack boss
    const { ctx: ctxAttack, replies: repliesAttack } = createMockContext({
      action: 'boss',
      subaction: 'attack',
    });
    await command.execute(ctxAttack);

    expect(repliesAttack[0].embeds).toHaveLength(1);
    expect(repliesAttack[0].embeds[0].data.description).toContain('You dealt');
    expect(repliesAttack[0].embeds[0].data.description).toContain('30 Energy');
  });

  it('should handle /game pvp against another player', async () => {
    const command = createGameCommand(services);

    baseCardsMap.set('base_1', {
      id: 'base_1',
      name: 'Hero 1',
      element: 'FIRE',
      health: 3000,
      attack: 500,
      defense: 100,
      speed: 100,
      critRate: 0.1,
    });
    baseCardsMap.set('base_2', {
      id: 'base_2',
      name: 'Hero 2',
      element: 'ICE',
      health: 2000,
      attack: 300,
      defense: 100,
      speed: 80,
      critRate: 0.1,
    });

    userCardsMap.set('user_commander_1', [
      { id: 'uc_1', cardId: 'base_1', level: 5, state: 'EQUIPPED' },
    ]);
    userCardsMap.set('user_rival_2', [
      { id: 'uc_2', cardId: 'base_2', level: 5, state: 'EQUIPPED' },
    ]);

    const { ctx, replies } = createMockContext({
      action: 'pvp',
      user: { id: 'user_rival_2', username: 'Rival' },
      wager: 50,
    });

    await command.execute(ctx);

    expect(replies[0].embeds).toHaveLength(1);
    expect(replies[0].embeds[0].data.title).toContain('PvP Elemental Duel');
    expect(replies[0].embeds[0].data.description).toContain('Combat Action Log');
  });

  it('should display the Town Shop catalog with /game shop', async () => {
    const command = createGameCommand(services);
    const { ctx, replies } = createMockContext({
      action: 'shop',
    });

    await command.execute(ctx);

    expect(replies).toHaveLength(1);
    const embed = replies[0].embeds[0];
    expect(embed.data.title).toContain('Town Item Shop Catalog');
    expect(embed.data.description).toContain('Stamina Elixir');
    expect(embed.data.description).toContain('1,000 credits');
  });

  it('should purchase an item with /game buy', async () => {
    const command = createGameCommand(services);
    const { ctx, replies } = createMockContext({
      action: 'buy',
      item: 'STAMINA_POTION',
      quantity: 2,
    });

    await command.execute(ctx);

    expect(replies).toHaveLength(1);
    const embed = replies[0].embeds[0];
    expect(embed.data.title).toContain('Town Shop Purchase Successful');
    expect(embed.data.description).toContain('2x Stamina Elixir');
    expect(embed.data.description).toContain('2,000 credits');
  });
});
