import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_ENHANCEMENT_LEVEL } from '@ririko/services';
import type { BotServices } from '../../../services.js';
import {
  recordAchievementProgress,
  recordEnhancementAchievement,
  syncCollectionAchievements,
} from '../achievement-progress.js';
import { enhanceGear } from '../gear-actions.js';

function createServices() {
  const achievementService = {
    recordProgress: vi.fn().mockResolvedValue([]),
    syncCollection: vi.fn().mockResolvedValue(undefined),
  };
  return {
    achievementService,
    services: { achievementService } as unknown as BotServices,
  };
}

describe('achievement progress helpers (BUG-0025)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('recordAchievementProgress', () => {
    it('passes the type, value and absolute flag to the achievement service', async () => {
      const { services, achievementService } = createServices();

      await recordAchievementProgress(services, 'u1', 'PVP_WINS', 1);
      await recordAchievementProgress(services, 'u1', 'DAILY_STREAK', 5, true);

      expect(achievementService.recordProgress.mock.calls).toEqual([
        ['u1', 'PVP_WINS', 1, false],
        ['u1', 'DAILY_STREAK', 5, true],
      ]);
    });

    it('logs and swallows a failure', async () => {
      const { services, achievementService } = createServices();
      achievementService.recordProgress.mockRejectedValue(new Error('database is down'));
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(
        recordAchievementProgress(services, 'u1', 'PVP_WINS', 1),
      ).resolves.toBeUndefined();

      expect(logged).toHaveBeenCalledTimes(1);
    });

    it('does nothing when the bot has no achievement service', async () => {
      await expect(
        recordAchievementProgress({} as unknown as BotServices, 'u1', 'PVP_WINS', 1),
      ).resolves.toBeUndefined();
    });
  });

  describe('syncCollectionAchievements', () => {
    it('syncs each distinct user once', async () => {
      const { services, achievementService } = createServices();

      await syncCollectionAchievements(services, 'u1', 'u2', 'u1');

      expect(achievementService.syncCollection.mock.calls).toEqual([['u1'], ['u2']]);
    });

    it('keeps syncing the other users when one fails', async () => {
      const { services, achievementService } = createServices();
      achievementService.syncCollection.mockRejectedValueOnce(new Error('database is down'));
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

      await syncCollectionAchievements(services, 'u1', 'u2');

      expect(achievementService.syncCollection).toHaveBeenCalledTimes(2);
      expect(logged).toHaveBeenCalledTimes(1);
    });

    it('does nothing when the bot has no achievement service', async () => {
      await expect(
        syncCollectionAchievements({} as unknown as BotServices, 'u1'),
      ).resolves.toBeUndefined();
    });
  });

  describe('recordEnhancementAchievement', () => {
    it('records EQUIPMENT_ENHANCE_10 only at the maximum level', async () => {
      const { services, achievementService } = createServices();

      await recordEnhancementAchievement(services, 'u1', MAX_ENHANCEMENT_LEVEL - 1);
      expect(achievementService.recordProgress).not.toHaveBeenCalled();

      await recordEnhancementAchievement(services, 'u1', MAX_ENHANCEMENT_LEVEL);
      expect(achievementService.recordProgress).toHaveBeenCalledWith(
        'u1',
        'EQUIPMENT_ENHANCE_10',
        1,
        true,
      );
    });
  });

  describe('enhanceGear (the /item and gear menu path)', () => {
    function createEnhanceServices(newLevel: number) {
      const { services, achievementService } = createServices();
      Object.assign(services, {
        economyRepo: {
          getOrCreateBalance: vi.fn().mockResolvedValue({ walletBalance: '100000' }),
          modifyBalance: vi.fn().mockResolvedValue({}),
        },
        enhancementService: {
          enhance: vi.fn().mockResolvedValue({
            success: true,
            previousLevel: newLevel - 1,
            newLevel,
            dustSpent: 10,
            creditsSpent: 500,
          }),
          getDustBalance: vi.fn().mockResolvedValue(40),
        },
      });
      return { services, achievementService };
    }

    it('records the +10 achievement when the item reaches +10', async () => {
      const { services, achievementService } = createEnhanceServices(10);

      const result = await enhanceGear(services, 'u1', 'inv-1');

      expect(result.dustLeft).toBe(40);
      expect(achievementService.recordProgress).toHaveBeenCalledWith(
        'u1',
        'EQUIPMENT_ENHANCE_10',
        1,
        true,
      );
    });

    it('records nothing below +10', async () => {
      const { services, achievementService } = createEnhanceServices(9);

      await enhanceGear(services, 'u1', 'inv-1');

      expect(achievementService.recordProgress).not.toHaveBeenCalled();
    });
  });
});
