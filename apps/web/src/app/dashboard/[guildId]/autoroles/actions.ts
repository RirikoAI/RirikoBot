'use server';

import type { SettingsFormState } from '@/lib/settings-form-state';
import { checkAssignableRoles } from '@/lib/server/guilds/setting-checks';
import { getWebServices } from '@/lib/server/services';
import { readFormFields, saveGuildSettings } from '@/lib/server/settings-action';

export async function saveAutoRoleSettings(
  guildId: string,
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  return saveGuildSettings(
    guildId,
    'autoroles',
    readFormFields(formData, {
      text: ['verificationRoleId'],
      list: ['humanRoleIds', 'botRoleIds'],
      flag: ['enabled'],
    }),
    {
      check: async (patch) =>
        checkAssignableRoles((await getWebServices()).guildResources, guildId, patch),
    },
  );
}
