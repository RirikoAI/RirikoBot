'use server';

import type { SettingsFormState } from '@/lib/settings-form-state';
import { readFormFields, saveGuildSettings } from '@/lib/server/settings-action';

export async function saveXpSettings(
  guildId: string,
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  return saveGuildSettings(
    guildId,
    'xp',
    readFormFields(formData, {
      text: ['levelUpChannelId', 'xpRatePercent'],
      list: ['noXpChannelIds', 'noXpRoleIds'],
      flag: ['levelUpAnnouncements', 'voiceXpEnabled'],
    }),
  );
}
