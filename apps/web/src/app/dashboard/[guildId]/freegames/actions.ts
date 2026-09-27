'use server';

import type { SettingsFormState } from '@/lib/settings-form-state';
import { checkMemberRole, checkMessageChannel } from '@/lib/server/guilds/setting-checks';
import { getWebServices } from '@/lib/server/services';
import { readFormFields, saveGuildSettings } from '@/lib/server/settings-action';

export async function saveFreeGamesSettings(
  guildId: string,
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  return saveGuildSettings(
    guildId,
    'freegames',
    readFormFields(formData, { text: ['channelId', 'pingRoleId'] }),
    {
      check: async (patch) => {
        const { guildResources } = await getWebServices();
        const [channelErrors, roleErrors] = await Promise.all([
          checkMessageChannel(guildResources, guildId, 'channelId', patch),
          checkMemberRole(guildResources, guildId, 'pingRoleId', patch),
        ]);
        return { ...channelErrors, ...roleErrors };
      },
    },
  );
}
