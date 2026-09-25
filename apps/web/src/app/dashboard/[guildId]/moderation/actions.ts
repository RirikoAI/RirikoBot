'use server';

import type { SettingsFormState } from '@/lib/settings-form-state';
import { pickFormFields, saveGuildSettings } from '@/lib/server/settings-action';

/** The escalation policy can kick and ban, so saving it needs a recent passkey check. */
export async function saveModerationSettings(
  guildId: string,
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  return saveGuildSettings(guildId, 'moderation', pickFormFields(formData, ['escalationSteps']), {
    stepUp: true,
  });
}
