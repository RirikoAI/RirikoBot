import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDungeonCommand } from '../dungeon.command.js';
import type { BotServices } from '../../../services.js';
import type { CommandContext } from '@ririko/discord';
import {
  ScalingEngine,
  DungeonRunner,
  TutorialService,
  DungeonLootService,
} from '@ririko/services';

describe('TASK-1042: Dungeon Command Suite & Loot Integration', () => {
  let services: BotServices;
  let replyMock: any;

  beforeEach(() => {
    replyMock = vi.fn().mockResolvedValue(undefined);

    const mockProgressRepo: any = {
      getOrCreateProgress: vi.fn().mockResolvedValue({
        id: 'prog_1',
        userId: 'user_123',
        seasonId: 's1_infernal_crucible',
        highestClearedFloor: 0,
        attemptsCount: 2,
        clearCount: 1,
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
    };

    const mockInventoryRepo: any = {
      create: vi.fn().mockResolvedValue({ id: 'inv_item_1' }),
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
    const cmd = createDungeonCommand(services);
    const ctx = createMockContext({ action: 'tutorial' }, ['tutorial']);

    await cmd.execute(ctx);

    expect(replyMock).toHaveBeenCalledTimes(1);
    const callArg = replyMock.mock.calls[0]![0];
    const embed = callArg.embeds[0].data;
    expect(embed.title).toContain('Prologue Tutorial');
    expect(embed.description).toContain('Flame Novice Aria');
    expect(embed.description).toContain('Novice Blade');
    expect(embed.description).toContain('TUTORIAL_COMPLETE');
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

  it('should execute floor climb, consume energy, and dispatch rewards on victory', async () => {
    const cmd = createDungeonCommand(services);
    const ctx = createMockContext({ action: 'climb', floor_number: 1 }, ['climb', '1']);

    await cmd.execute(ctx);

    expect(replyMock).toHaveBeenCalledTimes(1);
    const callArg = replyMock.mock.calls[0]![0];
    const embed = callArg.embeds[0].data;
    expect(embed.title).toContain('Floor 1');
    expect(embed.description).toContain('VICTORY');
    expect(embed.description).toContain('Credits');
  });
});
