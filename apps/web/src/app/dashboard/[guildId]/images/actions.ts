'use server';

import { configuredImageProviders, IMAGE_PROVIDER_LABELS } from '@ririko/core';
import type { SettingsFormState } from '@/lib/settings-form-state';
import { checkConfiguredProvider } from '@/lib/server/guilds/setting-checks';
import { getWebServices } from '@/lib/server/services';
import { pickFormFields, saveGuildSettings } from '@/lib/server/settings-action';

export async function saveImageSettings(
  guildId: string,
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  return saveGuildSettings(
    guildId,
    'images',
    pickFormFields(formData, ['defaultProvider', 'memberDailyLimit', 'defaultPreset']),
    {
      check: async (patch) => {
        const { config } = await getWebServices();
        return checkConfiguredProvider(
          configuredImageProviders(config),
          IMAGE_PROVIDER_LABELS,
          'defaultProvider',
          patch,
        );
      },
    },
  );
}
