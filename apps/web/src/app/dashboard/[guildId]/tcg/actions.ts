'use server';

import type { SettingsFormState } from '@/lib/settings-form-state';
import { checkMemberRole, checkMessageChannel } from '@/lib/server/guilds/setting-checks';
import { getWebServices } from '@/lib/server/services';
import { readFormFields, saveGuildSettings } from '@/lib/server/settings-action';

export async function saveTcgSettings(
  guildId: string,
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  return saveGuildSettings(
    guildId,
    'tcg',
    readFormFields(formData, {
      text: [
        'dropChannelId',
        'dropMessageThreshold',
        'dropStartHour',
        'dropEndHour',
        'dropClaimTimeoutSeconds',
        'dropCooldownMinutes',
        'managerRoleId',
      ],
      flag: ['dropsEnabled'],
    }),
    {
      check: async (patch) => {
        const { guildResources } = await getWebServices();
        const [channelErrors, roleErrors] = await Promise.all([
          checkMessageChannel(guildResources, guildId, 'dropChannelId', patch),
          checkMemberRole(guildResources, guildId, 'managerRoleId', patch),
        ]);
        return { ...channelErrors, ...roleErrors };
      },
    },
  );
}
