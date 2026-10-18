'use server';

import type { SettingsFormState } from '@/lib/settings-form-state';
import { checkMusicSettings } from '@/lib/server/guilds/setting-checks';
import { getWebServices } from '@/lib/server/services';
import { readFormFields, saveGuildSettings } from '@/lib/server/settings-action';

export async function saveMusicSettings(
  guildId: string,
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  return saveGuildSettings(
    guildId,
    'music',
    readFormFields(formData, {
      text: ['defaultVolume', 'musicChannelId', 'djRoleId'],
      flag: ['autoLeaveEmpty'],
    }),
    {
      check: async (patch) =>
        checkMusicSettings((await getWebServices()).guildResources, guildId, patch),
    },
  );
}
