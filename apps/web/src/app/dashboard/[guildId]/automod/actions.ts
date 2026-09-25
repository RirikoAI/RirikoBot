'use server';

import type { SettingsFormState } from '@/lib/settings-form-state';
import { readFormFields, saveGuildSettings } from '@/lib/server/settings-action';

const RULES = ['inviteFilter', 'phishingShield', 'mentionSpam', 'burstSpam'] as const;

export async function saveAutoModSettings(
  guildId: string,
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  return saveGuildSettings(
    guildId,
    'automod',
    readFormFields(formData, {
      text: [...RULES.map((rule) => `${rule}Action`), 'mentionSpamLimit', 'burstSpamLimit'],
      list: RULES.flatMap((rule) => [`${rule}ExemptRoleIds`, `${rule}ExemptChannelIds`]),
      flag: RULES.map((rule) => `${rule}Enabled`),
    }),
  );
}
