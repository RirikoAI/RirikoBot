'use server';

import type { SettingsFormState } from '@/lib/settings-form-state';
import { checkMessageChannel } from '@/lib/server/guilds/setting-checks';
import { getWebServices } from '@/lib/server/services';
import { readFormFields, saveGuildSettings } from '@/lib/server/settings-action';

export async function saveStarboardSettings(
  guildId: string,
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  return saveGuildSettings(
    guildId,
    'starboard',
    readFormFields(formData, {
      text: ['channelId', 'emoji', 'threshold'],
      list: ['ignoredChannelIds'],
      flag: ['allowSelfStar'],
    }),
    {
      check: async (patch) => {
        const { guildResources } = await getWebServices();
        return checkMessageChannel(guildResources, guildId, 'channelId', patch);
      },
    },
  );
}
