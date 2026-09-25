import { describe, it, expect, vi } from 'vitest';
import type {
  UserDungeonProgressRepository,
  UserInventoryItemRepository,
  GameItemRepository,
  TcgConfigRepository,
} from '@ririko/database';
import { TutorialService } from '../dungeon/tutorial-service.js';

describe('Tutorial Potions and Progression Rules (TASK-1046)', () => {
  function setupService(initialProgress = { highestClearedFloor: 0 }) {
    const configs = new Map<string, any>();
    const inventory: any[] = [];
    const gameItems = [
      {
        id: 'item_hp_minor',
        code: 'POTION_MINOR_HP',
        name: 'Minor HP Potion',
        type: 'CONSUMABLE',
        subtype: 'HP_POTION',
      },
      {
        id: 'item_mana_draught',
        code: 'POTION_MANA_DRAUGHT',
        name: 'Mana Draught',
        type: 'CONSUMABLE',
        subtype: 'MANA_POTION',
      },
    ];

    const progressRepo = {
      getOrCreateProgress: vi.fn(async () => ({ ...initialProgress })),
      recordFloorAttempt: vi.fn(),
    };

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

    const itemRepo = {
      findByCode: vi.fn(async (code: string) => gameItems.find((i) => i.code === code) ?? null),
      findById: vi.fn(async (id: string) => gameItems.find((i) => i.id === id) ?? null),
    };

    const inventoryRepo = {
      findByUser: vi.fn(async (userId: string, filter?: { state?: string }) => {
        let list = inventory.filter((i) => i.userId === userId);
        if (filter?.state) list = list.filter((i) => i.state === filter.state);
        return list;
      }),
      create: vi.fn(async (data: any) => {
        const item = { id: `inv_${inventory.length + 1}`, ...data };
        inventory.push(item);
        return item;
      }),
      update: vi.fn(async (id: string, updates: any) => {
        const found = inventory.find((i) => i.id === id);
        if (found) Object.assign(found, updates);
        return found;
      }),
    };

    const service = new TutorialService(progressRepo as unknown as UserDungeonProgressRepository, {
      inventoryRepo: inventoryRepo as unknown as UserInventoryItemRepository,
      itemRepo: itemRepo as unknown as GameItemRepository,
      tcgConfigRepo: tcgConfigRepo as unknown as TcgConfigRepository,
    });

    return { service, progressRepo, tcgConfigRepo, itemRepo, inventoryRepo, inventory, configs };
  }

  describe('canAttemptTutorialFloor', () => {
    it('allows floor 1 if highestClearedFloor is 0', async () => {
      const { service } = setupService({ highestClearedFloor: 0 });
      const check = await service.canAttemptTutorialFloor('u1', 1);
      expect(check.allowed).toBe(true);
    });

    it('blocks floor 1 if highestClearedFloor is >= 1 (ALREADY_CLEARED)', async () => {
      const { service } = setupService({ highestClearedFloor: 1 });
      const check = await service.canAttemptTutorialFloor('u1', 1);
      expect(check.allowed).toBe(false);
      expect(check.reason).toBe('ALREADY_CLEARED');
      expect(check.nextFloor).toBe(2);
    });

    it('blocks floor 3 if highestClearedFloor is 0 (LOCKED)', async () => {
      const { service } = setupService({ highestClearedFloor: 0 });
      const check = await service.canAttemptTutorialFloor('u1', 3);
      expect(check.allowed).toBe(false);
      expect(check.reason).toBe('LOCKED');
      expect(check.nextFloor).toBe(1);
    });

    it('allows floor 3 if highestClearedFloor is 2', async () => {
      const { service } = setupService({ highestClearedFloor: 2 });
      const check = await service.canAttemptTutorialFloor('u1', 3);
      expect(check.allowed).toBe(true);
    });
  });

  describe('ensureFloor3Potions', () => {
    it('grants 1x HP pot and 1x MP pot when user has none', async () => {
      const { service, inventory } = setupService();
      const res = await service.ensureFloor3Potions('u1');

      expect(res.granted).toBe(true);
      expect(res.hpPotionGranted).toBe(true);
      expect(res.manaPotionGranted).toBe(true);
      expect(inventory.length).toBe(2);
      expect(inventory.some((i) => i.itemId === 'item_hp_minor' && i.quantity === 1)).toBe(true);
      expect(inventory.some((i) => i.itemId === 'item_mana_draught' && i.quantity === 1)).toBe(
        true,
      );
    });

    it('does not grant duplicate potions if user already has them', async () => {
      const { service, inventory } = setupService();
      inventory.push(
        { id: 'inv_1', userId: 'u1', itemId: 'item_hp_minor', quantity: 2, state: 'IDLE' },
        { id: 'inv_2', userId: 'u1', itemId: 'item_mana_draught', quantity: 1, state: 'IDLE' },
      );

      const res = await service.ensureFloor3Potions('u1');
      expect(res.granted).toBe(false);
      expect(res.hpPotionGranted).toBe(false);
      expect(res.manaPotionGranted).toBe(false);
      expect(inventory.length).toBe(2);
    });
  });

  describe('handleTutorialFloor3Victory', () => {
    it('grants 5x HP pot and 5x MP pot (10 potions total) on first victory', async () => {
      const { service, inventory, configs } = setupService();
      const res = await service.handleTutorialFloor3Victory('u1');

      expect(res.granted).toBe(true);
      expect(res.message).toContain('10 Potions');
      expect(inventory.find((i) => i.itemId === 'item_hp_minor')?.quantity).toBe(5);
      expect(inventory.find((i) => i.itemId === 'item_mana_draught')?.quantity).toBe(5);
      expect(configs.has('tutorial:floor3:potions_reward:u1')).toBe(true);
    });

    it('does not grant bonus again on repeated call (idempotent)', async () => {
      const { service, inventory, configs } = setupService();
      configs.set('tutorial:floor3:potions_reward:u1', { grantedAt: Date.now() });

      const res = await service.handleTutorialFloor3Victory('u1');
      expect(res.granted).toBe(false);
      expect(inventory.length).toBe(0);
    });
  });
});
