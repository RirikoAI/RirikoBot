'use server';

import { AI_PROVIDER_LABELS, configuredAiProviders } from '@ririko/core';
import type { SettingsFormState } from '@/lib/settings-form-state';
import { checkConfiguredProvider, checkMessageChannel } from '@/lib/server/guilds/setting-checks';
import { getWebServices } from '@/lib/server/services';
import { readFormFields, saveGuildSettings } from '@/lib/server/settings-action';

export async function saveAiSettings(
  guildId: string,
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  return saveGuildSettings(
    guildId,
    'ai',
    readFormFields(formData, {
      text: ['channelId', 'speakingStyle', 'personalityPrompt', 'model'],
      list: ['tools'],
    }),
    {
      check: async (patch) => {
        const { config, guildResources } = await getWebServices();
        return {
          ...(await checkMessageChannel(guildResources, guildId, 'channelId', patch)),
          ...checkConfiguredProvider(
            configuredAiProviders(config),
            AI_PROVIDER_LABELS,
            'model',
            patch,
          ),
        };
      },
    },
  );
}
