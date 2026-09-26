'use server';

import type { SettingsFormState } from '@/lib/settings-form-state';
import { checkAutoVoiceHubs } from '@/lib/server/guilds/setting-checks';
import { getWebServices } from '@/lib/server/services';
import { pickFormFields, saveGuildSettings } from '@/lib/server/settings-action';

export async function saveAutoVoiceSettings(
  guildId: string,
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  return saveGuildSettings(guildId, 'autovoice', pickFormFields(formData, ['hubs']), {
    check: async (patch) =>
      checkAutoVoiceHubs((await getWebServices()).guildResources, guildId, patch.hubs),
  });
}
