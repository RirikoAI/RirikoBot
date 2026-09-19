import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDungeonCommand } from '../dungeon.command.js';
import type { BotServices } from '../../../services.js';
import type { CommandContext } from '@ririko/discord';
import {
  ScalingEngine,
  DungeonRunner,
  TutorialService,
  DungeonLootService,
  LoadoutService,
} from '@ririko/services';

describe('TASK-1042: Dungeon Command Suite & Loot Integration', () => {
  let services: BotServices;
  let replyMock: any;
  let mockProgressRepo: any;

  beforeEach(() => {
    replyMock = vi.fn().mockResolvedValue(undefined);

    mockProgressRepo = {
      getOrCreateProgress: vi.fn().mockImplementation((userId: string, seasonId: string) => {
        if (seasonId === 'season_tutorial') {
          return Promise.resolve({
            id: 'prog_tut',
            userId,
            seasonId: 'season_tutorial',
            highestClearedFloor: 4,
            attemptsCount: 4,
            clearCount: 4,
          });
        }
        return Promise.resolve({
          id: 'prog_1',
          userId,
          seasonId: 's1_infernal_crucible',
          highestClearedFloor: 0,
          attemptsCount: 2,
          clearCount: 1,
        });
      }),
      recordFloorAttempt: vi.fn().mockResolvedValue({
        id: 'prog_1',
        userId: 'user_123',
        seasonId: 's1_infernal_crucible',
        highestClearedFloor: 1,
        attemptsCount: 3,
        clearCount: 2,
      }),
      getSeasonLeaderboard: vi.fn().mockResolvedValue([
        { userId: 'user_ace', highestClearedFloor: 45, clearCount: 45, attemptsCount: 50 },
        { userId: 'user_123', highestClearedFloor: 10, clearCount: 10, attemptsCount: 12 },
      ]),
    };

    const mockEnergyRepo: any = {
      getOrCreate: vi.fn().mockResolvedValue({
        userId: 'user_123',
        currentEnergy: 100,
        maxEnergy: 100,
      }),
      consumeEnergy: vi.fn().mockResolvedValue({
        success: true,
        currentEnergy: 90,
      }),
    };

    const mockSeasonRepo: any = {
      findActiveSeason: vi.fn().mockResolvedValue({
        id: 's1_infernal_crucible',
        name: 'Season 1: Infernal Crucible',
        themeElement: 'FIRE',
        seasonalAffixes: ['SCORCHED_EARTH', 'HEAT_HAZE'],
      }),
    };

    const mockCardRepo: any = {
      listUserCards: vi.fn().mockResolvedValue([
        { id: 'uc_1', cardId: 'base_card_1', level: 10, state: 'EQUIPPED' },
      ]),
      findById: vi.fn().mockResolvedValue({
        id: 'base_card_1',
        name: 'Flame Valkyrie',
        element: 'FIRE',
        rarity: 'RARE',
        health: 2000,
        attack: 300,
        defense: 150,
        speed: 60,
        critRate: 0.15,
      }),
      createUserCard: vi.fn().mockResolvedValue({ id: 'new_card_1' }),
      updateUserCardState: vi.fn().mockResolvedValue({}),
    };

    const mockLoadoutService: any = {
      getCardLoadout: vi.fn().mockResolvedValue({
        weapon: null,
        armor: null,
        relic: null,
        ring: null,
        amulet: null,
        talisman: null,
      }),
      applyLoadoutToCombatant: vi.fn(),
      cardRepo: mockCardRepo,
      buildCombatant: LoadoutService.prototype.buildCombatant,
      buildActiveParty: LoadoutService.prototype.buildActiveParty,
    };

    const mockInventoryRepo: any = {
      create: vi.fn().mockResolvedValue({ id: 'inv_item_1' }),
      findByUser: vi.fn().mockResolvedValue([]),
    };

    const mockEconomyRepo: any = {
      modifyBalance: vi.fn().mockResolvedValue({}),
    };

    const mockXpRepo: any = {
      addXp: vi.fn().mockResolvedValue({}),
    };

    const scalingEngine = new ScalingEngine();
    const dungeonLootService = new DungeonLootService({
      economyRepo: mockEconomyRepo,
      inventoryRepo: mockInventoryRepo,
      xpRepo: mockXpRepo,
    });
    const dungeonRunner = new DungeonRunner(mockEnergyRepo, mockProgressRepo, {
      scalingEngine,
      lootService: dungeonLootService,
    });
    const tutorialService = new TutorialService(mockProgressRepo, {
      cardRepo: mockCardRepo,
      inventoryRepo: mockInventoryRepo,
    });

    services = {
      dungeonSeasonRepo: mockSeasonRepo,
      userDungeonProgressRepo: mockProgressRepo,
      playerEnergyRepo: mockEnergyRepo,
      waifuCardRepo: mockCardRepo,
      loadoutService: mockLoadoutService,
      scalingEngine,
      dungeonRunner,
      tutorialService,
      dungeonLootService,
    } as unknown as BotServices;
  });

  const createMockContext = (options: Record<string, any> = {}, rawArgs: string[] = []): CommandContext => ({
    user: { id: 'user_123', username: 'TestHero' } as any,
    guild: { id: 'guild_123' } as any,
    options: {
      getString: (key: string) => options[key] ?? null,
      getInteger: (key: string) => options[key] ?? null,
      getRawArgs: () => rawArgs,
    } as any,
    reply: replyMock,
  } as unknown as CommandContext);

  it('should display tower status including active season, highest floor, and energy', async () => {
    const cmd = createDungeonCommand(services);
    const ctx = createMockContext({ action: 'status' }, ['status']);

    await cmd.execute(ctx);

    expect(replyMock).toHaveBeenCalledTimes(1);
    const callArg = replyMock.mock.calls[0]![0];
    expect(callArg.embeds).toBeDefined();
    const embed = callArg.embeds[0].data;
    expect(embed.title).toContain('Tower Status');
    expect(embed.description).toContain('Season 1: Infernal Crucible');
    expect(embed.description).toContain('Floor 0');
    expect(embed.description).toContain('100/100 Energy');
  });

  it('should inspect specific floor attributes and strategic checks', async () => {
    const cmd = createDungeonCommand(services);
    const ctx = createMockContext({ action: 'floor', floor_number: 10 }, ['floor', '10']);

    await cmd.execute(ctx);

    expect(replyMock).toHaveBeenCalledTimes(1);
    const callArg = replyMock.mock.calls[0]![0];
    const embed = callArg.embeds[0].data;
    expect(embed.title).toContain('Floor 10 [MAJOR_BOSS]');
    expect(embed.description).toContain('3.2x');
    expect(embed.description).toContain('10 Energy');
    expect(embed.description).toContain('Skill & Potion timing check');
  });

  it('should complete tutorial prologue and dispatch starter rewards', async () => {
    mockProgressRepo.getOrCreateProgress.mockImplementation((userId: string, seasonId: string) => {
      if (seasonId === 'season_tutorial') {
        return Promise.resolve({
          id: 'prog_tut',
          userId,
          seasonId: 'season_tutorial',
          highestClearedFloor: 3,
          attemptsCount: 3,
          clearCount: 3,
        });
      }
      return Promise.resolve({
        id: 'prog_1',
        userId,
        seasonId: 's1_infernal_crucible',
        highestClearedFloor: 0,
        attemptsCount: 2,
        clearCount: 1,
      });
    });

    const cmd = createDungeonCommand(services);
    const ctx = createMockContext({ action: 'tutorial' }, ['tutorial']);

    await cmd.execute(ctx);

    expect(replyMock).toHaveBeenCalledTimes(1);
    const callArg = replyMock.mock.calls[0]![0];
    const embed = callArg.embeds[0].data;
    expect(embed.title).toContain('Tutorial Floor T4');
    expect(embed.description).toContain('Flame Valkyrie');
    expect(embed.description).toContain('Tactical Lesson');
    expect(callArg.components).toBeDefined();
    expect(callArg.components[0].components.length).toBe(5); // Attack, Skill, Defend, Auto, Forfeit
  });

  it('should prompt incomplete players to begin tutorial when running climb directly', async () => {
    mockProgressRepo.getOrCreateProgress.mockImplementation((userId: string, seasonId: string) => {
      if (seasonId === 'season_tutorial') {
        return Promise.resolve({
          id: 'prog_tut',
          userId,
          seasonId: 'season_tutorial',
          highestClearedFloor: 0,
          attemptsCount: 0,
          clearCount: 0,
        });
      }
      return Promise.resolve({
        id: 'prog_1',
        userId,
        seasonId: 's1_infernal_crucible',
        highestClearedFloor: 0,
        attemptsCount: 0,
        clearCount: 0,
      });
    });

    const cmd = createDungeonCommand(services);
    const ctx = createMockContext({ action: 'climb' }, ['climb']);

    await cmd.execute(ctx);

    expect(replyMock).toHaveBeenCalledTimes(1);
    const callArg = replyMock.mock.calls[0]![0];
    const embed = callArg.embeds[0].data;
    expect(embed.title).toContain('Prologue Tutorial Required');
    expect(embed.description).toContain("You haven't finished the tutorial yet!");
    expect(embed.description).toContain('Begin **Tutorial Floor 1 / 4**?');
    expect(callArg.components[0].components.length).toBe(2); // Begin Tutorial, Cancel
    expect(callArg.components[0].components[0].data.label).toContain('Begin Tutorial Floor 1 / 4');
  });

  it('should resolve $climb prefix alias to climb action', async () => {
    const cmd = createDungeonCommand(services);
    const ctx: any = {
      source: 'prefix',
      raw: { content: '$climb' },
      invokedPrefix: '$',
      user: { id: 'user_123', username: 'TestHero' },
      guild: { id: 'guild_123' },
      options: {
        getString: () => null,
        getInteger: () => null,
        getRawArgs: () => [],
      },
      reply: replyMock,
    };

    await cmd.execute(ctx);

    expect(replyMock).toHaveBeenCalledTimes(1);
    const callArg = replyMock.mock.calls[0]![0];
    const embed = callArg.embeds[0].data;
    expect(embed.title).toContain('Floor 1');
    expect(embed.description).toContain('Flame Valkyrie');
    expect(embed.description).toContain('HP:');
    expect(embed.description).toContain('MP:');
    expect(callArg.components[0].components.length).toBe(5);
  });

  it('should display seasonal leaderboard with top climbers', async () => {
    const cmd = createDungeonCommand(services);
    const ctx = createMockContext({ action: 'leaderboard' }, ['leaderboard']);

    await cmd.execute(ctx);

    expect(replyMock).toHaveBeenCalledTimes(1);
    const callArg = replyMock.mock.calls[0]![0];
    const embed = callArg.embeds[0].data;
    expect(embed.title).toContain('Top Tower Climbers');
    expect(embed.description).toContain('Floor 45');
    expect(embed.description).toContain('Floor 10');
  });

  it('should execute floor climb, initialize interactive battle HUD, and expose tactical buttons', async () => {
    const cmd = createDungeonCommand(services);
    const ctx = createMockContext({ action: 'climb', floor_number: 1 }, ['climb', '1']);

    await cmd.execute(ctx);

    expect(replyMock).toHaveBeenCalledTimes(1);
    const callArg = replyMock.mock.calls[0]![0];
    const embed = callArg.embeds[0].data;
    expect(embed.title).toContain('Floor 1');
    expect(embed.description).toContain('HP:');
    expect(embed.description).toContain('MP:');

    // Verify all 5 interactive buttons are present
    const buttons = callArg.components[0].components;
    expect(buttons.length).toBe(5);
    expect(buttons[0].data.label).toContain('Attack');
    expect(buttons[1].data.label).toContain('Skill');
    expect(buttons[2].data.label).toContain('Defend');
    expect(buttons[3].data.label).toContain('Auto');
    expect(buttons[4].data.label).toContain('Forfeit');
  });

  it('should support auto mode option with pause and skip controls', async () => {
    const cmd = createDungeonCommand(services);
    const ctx = createMockContext({ action: 'climb', floor_number: 1, mode: 'auto' }, ['climb', '1', 'auto']);

    await cmd.execute(ctx);

    expect(replyMock).toHaveBeenCalledTimes(1);
    const callArg = replyMock.mock.calls[0]![0];
    const embed = callArg.embeds[0].data;
    expect(embed.title).toContain('Floor 1');

    // In auto mode, buttons are Pause, Skip, Forfeit
    const buttons = callArg.components[0].components;
    expect(buttons.length).toBe(3);
    expect(buttons[0].data.label).toContain('Pause');
    expect(buttons[1].data.label).toContain('Skip');
    expect(buttons[2].data.label).toContain('Forfeit');
  });
});
