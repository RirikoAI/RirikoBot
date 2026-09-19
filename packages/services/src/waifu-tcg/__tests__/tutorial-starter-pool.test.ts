import { describe, it, expect, vi } from 'vitest';
import type {
  UserDungeonProgressRepository,
  WaifuAssetRepository,
  WaifuCardRepository,
} from '@ririko/database';
import { TutorialService } from '../dungeon/tutorial-service.js';

function setup(options: {
  cards?: Array<{
    id: string;
    name: string;
    element: string;
    rarity?: string;
    isActive?: boolean;
    attack?: number;
    defense?: number;
    health?: number;
    speed?: number;
  }>;
  random?: () => number;
}) {
  const cards = new Map(
    (
      options.cards ?? [
        {
          id: 'card_aria',
          name: 'Flame Novice Aria',
          element: 'FIRE',
          rarity: 'COMMON',
          isActive: true,
        },
        {
          id: 'card_lyra',
          name: 'Frost Novice Lyra',
          element: 'ICE',
          rarity: 'COMMON',
          isActive: true,
        },
      ]
    ).map((c) => [c.id, c]),
  );

  const cardRepo = {
    listUserCards: vi.fn().mockResolvedValue([]),
    findById: vi.fn(async (id: string) => cards.get(id) ?? null),
    listCards: vi.fn(async (opts?: { rarity?: string; isActive?: boolean }) => {
      let list = [...cards.values()];
      if (opts?.rarity) list = list.filter((c) => c.rarity === opts.rarity);
      if (opts?.isActive !== undefined) list = list.filter((c) => c.isActive === opts.isActive);
      return list;
    }),
    getHighestSerialNumber: vi.fn().mockResolvedValue(4),
    createUserCard: vi.fn(
      async (data: { cardId: string; serialNumber: number; state: string }) => ({
        id: 'uc1',
        ...data,
      }),
    ),
    create: vi.fn(),
  };

  const assetRepo = {
    findActiveAssetsByTag: vi.fn().mockResolvedValue([]),
    findActiveAssets: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
  };

  const progressRepo = {
    getOrCreateProgress: vi.fn().mockResolvedValue({ highestClearedFloor: 0 }),
    recordFloorAttempt: vi.fn(),
  };

  const service = new TutorialService(progressRepo as unknown as UserDungeonProgressRepository, {
    cardRepo: cardRepo as unknown as WaifuCardRepository,
    assetRepo: assetRepo as unknown as WaifuAssetRepository,
    randomFn: options.random ?? (() => 0),
  });

  return { service, cardRepo, assetRepo };
}

describe('TutorialService starter cards', () => {
  it('grants a real common card from the stronger half of the pool as starter card', async () => {
    const { service, cardRepo } = setup({
      cards: [
        {
          id: 'card_c1',
          name: 'Wind Dancer',
          element: 'EARTH',
          rarity: 'COMMON',
          isActive: true,
          attack: 60,
          defense: 40,
          health: 600,
          speed: 20,
        },
        {
          id: 'card_c2',
          name: 'Water Nymph',
          element: 'WATER',
          rarity: 'COMMON',
          isActive: true,
          attack: 250,
          defense: 180,
          health: 1400,
          speed: 70,
        },
      ],
      random: () => 0,
    });

    const granted = await service.ensureStarterCard('user1');

    expect(cardRepo.listCards).toHaveBeenCalledWith({
      rarity: 'COMMON',
      isActive: true,
      limit: 100,
    });
    expect(granted).toMatchObject({ cardId: 'card_c2', serialNumber: 5, state: 'EQUIPPED' });
    expect(cardRepo.create).not.toHaveBeenCalled();
  });

  it('skips inactive cards and falls back to any active card if no common cards exist', async () => {
    const { service } = setup({
      cards: [
        { id: 'card_rare', name: 'Rare Knight', element: 'LIGHT', rarity: 'RARE', isActive: true },
      ],
      random: () => 0,
    });

    const granted = await service.ensureStarterCard('user1');
    expect(granted?.cardId).toBe('card_rare');
  });

  it('reports the granted card on tutorial completion', async () => {
    const { service } = setup({
      cards: [
        { id: 'card_c1', name: 'Frost Hero', element: 'ICE', rarity: 'COMMON', isActive: true },
      ],
    });

    const result = await service.completeTutorial('user1');
    expect(result.starterCardId).toBe('card_c1');
    expect(result.starterCardName).toBe('Frost Hero [ICE]');
    expect(result.message).toContain('**Card:** Frost Hero [ICE]');
  });
});
