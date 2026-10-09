import { MAX_ENHANCEMENT_LEVEL, type AchievementService } from '@ririko/services';
import type { BotServices } from '../../services.js';

type AchievementServices = Pick<BotServices, 'achievementService'>;

/**
 * Records achievement progress from a TCG command. A failure is logged and swallowed, so a broken
 * achievement write never breaks the reply the player is waiting for.
 *
 * `isAbsolute` sets the progress to `value` (keeping the highest value seen); otherwise `value`
 * is added to it.
 */
export async function recordAchievementProgress(
  services: AchievementServices,
  userId: string,
  requirementType: string,
  value: number,
  isAbsolute = false,
): Promise<void> {
  const achievements = services.achievementService as AchievementService | undefined;
  if (!achievements) return;
  try {
    await achievements.recordProgress(userId, requirementType, value, isAbsolute);
  } catch (err) {
    console.error(`[Achievements] Failed to record ${requirementType} for ${userId}:`, err);
  }
}

/**
 * Brings the collection achievements (cards, elements, mythic cards) of each user up to date
 * after their collection changed. Errors are logged and swallowed like `recordAchievementProgress`.
 */
export async function syncCollectionAchievements(
  services: AchievementServices,
  ...userIds: string[]
): Promise<void> {
  const achievements = services.achievementService as AchievementService | undefined;
  if (!achievements) return;
  for (const userId of new Set(userIds)) {
    try {
      await achievements.syncCollection(userId);
    } catch (err) {
      console.error(`[Achievements] Failed to sync the collection of ${userId}:`, err);
    }
  }
}

/** Records the +10 enhancement achievement when a gear piece reaches the maximum level. */
export async function recordEnhancementAchievement(
  services: AchievementServices,
  userId: string,
  newLevel: number,
): Promise<void> {
  if (newLevel < MAX_ENHANCEMENT_LEVEL) return;
  await recordAchievementProgress(services, userId, 'EQUIPMENT_ENHANCE_10', 1, true);
}
