import { describe, it, expect, vi } from 'vitest';
import type {
  UserDungeonProgressRepository,
  WaifuAssetRepository,
  WaifuCardRepository,
} from '@ririko/database';
import { TutorialService } from '../dungeon/tutorial-service.js';
import { STARTER_POOL_TAG } from '../catalog/card-catalog.js';

function setup(options: { poolAssets: string[]; inactive?: string[]; random?: () => number }) {
  const cards = new Map(
    options.poolAssets.map((assetId) => [
      assetId,
      {
        id: `card_${assetId}`,
        name: `Hero ${assetId}`,
        element: 'ICE',
        isActive: !options.inactive?.includes(assetId),
      },
    ]),
  );
  const cardRepo = {
    listUserCards: vi.fn().mockResolvedValue([]),
    findByAssetId: vi.fn(async (assetId: string) => cards.get(assetId) ?? null),
    findById: vi.fn(async (id: string) => [...cards.values()].find((c) => c.id === id) ?? null),
    getHighestSerialNumber: vi.fn().mockResolvedValue(4),
    createUserCard: vi.fn(async (data: { cardId: string }) => ({ id: 'uc1', ...data })),
    create: vi.fn(),
  };
  const assetRepo = {
    findActiveAssetsByTag: vi.fn().mockResolvedValue(options.poolAssets.map((id) => ({ id }))),
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

describe('TutorialService starter pool', () => {
  it('grants a random active card from the starter pool with the next serial number', async () => {
    const { service, cardRepo, assetRepo } = setup({
      poolAssets: ['a1', 'a2', 'a3'],
      random: () => 0.5,
    });
    const granted = await service.ensureStarterCard('user1');

    expect(assetRepo.findActiveAssetsByTag).toHaveBeenCalledWith(STARTER_POOL_TAG);
    expect(granted).toMatchObject({ cardId: 'card_a2', serialNumber: 5, state: 'EQUIPPED' });
    expect(cardRepo.create).not.toHaveBeenCalled();
  });

  it('skips inactive pool cards', async () => {
    const { service } = setup({ poolAssets: ['a1', 'a2'], inactive: ['a1'], random: () => 0 });
    expect((await service.ensureStarterCard('user1'))?.cardId).toBe('card_a2');
  });

  it('falls back to the fixed Aria starter when the pool is empty', async () => {
    const { service, cardRepo } = setup({ poolAssets: [] });
    const granted = await service.ensureStarterCard('user1');
    expect(granted?.cardId).toBe('starter_waifu_01');
    expect(cardRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'starter_waifu_01' }),
    );
  });

  it('reports the granted pool card on tutorial completion', async () => {
    const { service } = setup({ poolAssets: ['a1'] });
    const result = await service.completeTutorial('user1');
    expect(result.starterCardId).toBe('card_a1');
    expect(result.starterCardName).toBe('Hero a1 [ICE]');
    expect(result.message).toContain('**Card:** Hero a1 [ICE]');
  });
});
