import { describe, it, expect, vi } from 'vitest';
import type {
  UserDungeonProgressRepository,
  WaifuCardRepository,
  TcgConfigRepository,
} from '@ririko/database';
import { TutorialService, getCounterElement } from '../dungeon/tutorial-service.js';

describe('Tutorial Floor T4 Dynamic Elemental Disadvantage & Counter Card Grant', () => {
  it('correctly computes counter elements across all 7 affinities', () => {
    expect(getCounterElement('FIRE')).toBe('WATER');
    expect(getCounterElement('WATER')).toBe('LIGHTNING');
    expect(getCounterElement('LIGHTNING')).toBe('EARTH');
    expect(getCounterElement('EARTH')).toBe('ICE');
    expect(getCounterElement('ICE')).toBe('FIRE');
    expect(getCounterElement('LIGHT')).toBe('SHADOW');
    expect(getCounterElement('SHADOW')).toBe('LIGHT');
  });

  function setupService() {
    const configs = new Map<string, any>();
    const userCards: any[] = [];

    const dbCards = [
      {
        id: 'card_fire_c',
        name: 'Blaze Maiden',
        element: 'FIRE',
        rarity: 'COMMON',
        isActive: true,
      },
      {
        id: 'card_water_c',
        name: 'River Nymph',
        element: 'WATER',
        rarity: 'COMMON',
        isActive: true,
      },
      {
        id: 'card_ice_c',
        name: 'Glacial Spirit',
        element: 'ICE',
        rarity: 'COMMON',
        isActive: true,
      },
      {
        id: 'card_earth_c',
        name: 'Terra Golem',
        element: 'EARTH',
        rarity: 'COMMON',
        isActive: true,
      },
      {
        id: 'card_lightning_c',
        name: 'Storm Pixie',
        element: 'LIGHTNING',
        rarity: 'COMMON',
        isActive: true,
      },
    ];

    const tcgConfigRepo = {
      getConfig: vi.fn(async (key: string) => configs.get(key) ?? null),
      setConfig: vi.fn(async (key: string, value: any) => {
        configs.set(key, value);
        return { key, value };
      }),
      delete: vi.fn(async (key: string) => {
        configs.delete(key);
      }),
    };

    const cardRepo = {
      listUserCards: vi.fn(async (userId: string, filter?: { state?: string }) => {
        let list = userCards.filter((c) => c.userId === userId);
        if (filter?.state) list = list.filter((c) => c.state === filter.state);
        return list;
      }),
      findById: vi.fn(async (id: string) => dbCards.find((c) => c.id === id) ?? null),
      findUserCardById: vi.fn(async (id: string) => userCards.find((c) => c.id === id) ?? null),
      listCards: vi.fn(async (opts?: { rarity?: string; element?: string; isActive?: boolean }) => {
        let list = [...dbCards];
        if (opts?.rarity) list = list.filter((c) => c.rarity === opts.rarity);
        if (opts?.element) list = list.filter((c) => c.element === opts.element);
        if (opts?.isActive !== undefined) list = list.filter((c) => c.isActive === opts.isActive);
        return list;
      }),
      getHighestSerialNumber: vi.fn().mockResolvedValue(10),
      createUserCard: vi.fn(
        async (data: { userId: string; cardId: string; serialNumber: number; state: string }) => {
          const row = { id: `uc_${userCards.length + 1}`, ...data };
          userCards.push(row);
          return row;
        },
      ),
      updateUserCardState: vi.fn(async (id: string, state: string) => {
        const found = userCards.find((c) => c.id === id);
        if (found) found.state = state;
      }),
    };

    const progressRepo = {
      getOrCreateProgress: vi.fn().mockResolvedValue({ highestClearedFloor: 3 }),
      recordFloorAttempt: vi.fn(),
    };

    const service = new TutorialService(progressRepo as unknown as UserDungeonProgressRepository, {
      cardRepo: cardRepo as unknown as WaifuCardRepository,
      tcgConfigRepo: tcgConfigRepo as unknown as TcgConfigRepository,
    });

    return { service, tcgConfigRepo, cardRepo, configs, userCards };
  }

  it('generates a counter element boss for player element and locks it in metadata', async () => {
    const { service, tcgConfigRepo } = setupService();

    // Player enters with FIRE card -> boss must be WATER
    const config = await service.getFloor4BossConfig('user123', 'FIRE');
    expect(config.element).toBe('WATER');
    expect(config.name).toBe('Warded Guardian Automaton [WATER]');

    expect(tcgConfigRepo.setConfig).toHaveBeenCalledWith(
      'tutorial:floor4:user123',
      { bossElement: 'WATER', counterCardGiven: false },
      'system',
    );

    // If player enters again with a different card (e.g. WATER), boss remains locked to WATER
    const config2 = await service.getFloor4BossConfig('user123', 'WATER');
    expect(config2.element).toBe('WATER');
  });

  it('grants a real common card of the boss element on Floor T4 defeat and updates metadata', async () => {
    const { service, tcgConfigRepo, userCards } = setupService();

    // 1. First defeat against WATER boss
    const defeatResult = await service.handleTutorialFloor4Defeat('user123', 'WATER');
    expect(defeatResult.isNewGrant).toBe(true);
    expect(defeatResult.alreadyOwned).toBe(false);
    expect(defeatResult.bossElement).toBe('WATER');
    expect(defeatResult.counterCard?.id).toBe('card_water_c');
    expect(defeatResult.counterCard?.name).toBe('River Nymph');
    expect(defeatResult.userCard).toBeDefined();
    expect(defeatResult.userCard?.cardId).toBe('card_water_c');
    expect(defeatResult.userCard?.state).toBe('IDLE');

    expect(tcgConfigRepo.setConfig).toHaveBeenCalledWith(
      'tutorial:floor4:user123',
      expect.objectContaining({
        bossElement: 'WATER',
        counterCardGiven: true,
        counterCardId: 'card_water_c',
      }),
      'system',
    );

    // 2. Second defeat against WATER boss -> should NOT duplicate card
    const defeatResult2 = await service.handleTutorialFloor4Defeat('user123', 'WATER');
    expect(defeatResult2.isNewGrant).toBe(false);
    expect(defeatResult2.alreadyOwned).toBe(true);
    expect(defeatResult2.counterCard?.id).toBe('card_water_c');
    expect(userCards.length).toBe(1); // Still only 1 card granted
  });

  it('recovers and grants a counter card if metadata says given but user card was deleted/missing', async () => {
    const { service, configs, userCards } = setupService();

    // Stale metadata from a previous attempt before a reset
    configs.set('tutorial:floor4:user123', {
      bossElement: 'WATER',
      counterCardGiven: true,
      counterCardId: 'card_water_c',
      userCardId: 'uc_stale_999', // deleted
    });

    // User currently has 0 cards
    expect(userCards.length).toBe(0);

    const defeatResult = await service.handleTutorialFloor4Defeat('user123', 'WATER');

    // Should detect that user does NOT possess the card and grant a new one
    expect(defeatResult.isNewGrant).toBe(true);
    expect(defeatResult.alreadyOwned).toBe(false);
    expect(defeatResult.counterCard?.id).toBe('card_water_c');
    expect(defeatResult.userCard).toBeDefined();
    expect(defeatResult.userCard?.id).toBe('uc_1');
    expect(userCards.length).toBe(1);
  });

  it('cleans up Floor T4 metadata upon tutorial completion', async () => {
    const { service, tcgConfigRepo, configs } = setupService();
    configs.set('tutorial:floor4:user123', { bossElement: 'WATER', counterCardGiven: true });

    await service.completeTutorial('user123');

    expect(tcgConfigRepo.delete).toHaveBeenCalledWith('tutorial:floor4:user123');
    expect(configs.has('tutorial:floor4:user123')).toBe(false);
  });
});
