'use server';

import type { SettingsFormState } from '@/lib/settings-form-state';
import { pickFormFields, saveGuildSettings } from '@/lib/server/settings-action';

export async function saveCommandOverrides(
  guildId: string,
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  return saveGuildSettings(guildId, 'commands', pickFormFields(formData, ['overrides']));
}
