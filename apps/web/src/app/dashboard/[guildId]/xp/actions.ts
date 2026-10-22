'use server';

import type { SettingsFormState } from '@/lib/settings-form-state';
import { checkLevelRoleRewards } from '@/lib/server/guilds/setting-checks';
import { getWebServices } from '@/lib/server/services';
import { pickFormFields, readFormFields, saveGuildSettings } from '@/lib/server/settings-action';

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

/**
 * Saves the level role rewards: the JSON list of the row editor and the "keep lower roles"
 * switch. Every role must exist in this server and be one Ririko can give.
 */
export async function saveLevelRoleSettings(
  guildId: string,
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  return saveGuildSettings(
    guildId,
    'levelroles',
    {
      ...pickFormFields(formData, ['rewards']),
      ...readFormFields(formData, { flag: ['keepPreviousRoles'] }),
    },
    {
      check: async (patch) =>
        checkLevelRoleRewards((await getWebServices()).guildResources, guildId, patch.rewards),
    },
  );
}
