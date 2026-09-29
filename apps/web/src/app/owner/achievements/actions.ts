'use server';

import { revalidatePath } from 'next/cache';
import type { SettingsFormState } from '@/lib/settings-form-state';
import { runOwnerAction } from '@/lib/server/owner-action';
import { getWebServices } from '@/lib/server/services';
import { readFormFields } from '@/lib/server/settings-action';

const ACHIEVEMENT_FIELDS = {
  text: ['title', 'description', 'tier', 'rewardXp', 'rewardCredits', 'rewardTitle', 'badgeIcon'],
  flag: ['isHidden'],
} as const;

export async function saveAchievement(
  achievementId: string,
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const values = readFormFields(formData, ACHIEVEMENT_FIELDS);
  return runOwnerAction(values, async (actor) => {
    const { tcgAchievements } = await getWebServices();
    const { changed } = await tcgAchievements.update(achievementId, values, actor);
    revalidatePath('/owner/achievements');
    return {
      status: 'saved',
      message: changed ? 'Achievement saved.' : 'Nothing changed.',
      values,
    };
  });
}
