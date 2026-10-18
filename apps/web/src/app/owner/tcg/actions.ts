'use server';

import { revalidatePath } from 'next/cache';
import { TCG_RULES_KEYS } from '@ririko/core';
import type { SettingsFormState } from '@/lib/settings-form-state';
import { runOwnerAction } from '@/lib/server/owner-action';
import { getWebServices } from '@/lib/server/services';
import { pickFormFields } from '@/lib/server/settings-action';

export async function saveTcgRules(
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const patch = pickFormFields(formData, TCG_RULES_KEYS);
  return runOwnerAction(patch, async (actor) => {
    const { tcgRules } = await getWebServices();
    const { values, changes } = await tcgRules.update(patch, actor);
    revalidatePath('/owner/tcg');
    return {
      status: 'saved',
      message: changes.length > 0 ? 'Rules saved.' : 'Nothing changed.',
      values,
    };
  });
}
