'use server';

import { revalidatePath } from 'next/cache';
import { ECONOMY_CONFIG_KEYS } from '@ririko/core';
import type { SettingsFormState } from '@/lib/settings-form-state';
import { runOwnerAction } from '@/lib/server/owner-action';
import { getWebServices } from '@/lib/server/services';
import { pickFormFields } from '@/lib/server/settings-action';

export async function saveEconomySettings(
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const patch = pickFormFields(formData, ECONOMY_CONFIG_KEYS);
  return runOwnerAction(patch, async (actor) => {
    const { economyConfig } = await getWebServices();
    const { values, changes } = await economyConfig.update(patch, actor);
    revalidatePath('/owner/economy');
    return {
      status: 'saved',
      message: changes.length > 0 ? 'Settings saved.' : 'Nothing changed.',
      values,
    };
  });
}
