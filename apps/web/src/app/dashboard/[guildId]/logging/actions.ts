'use server';

import type { SettingsFormState } from '@/lib/settings-form-state';
import { checkMessageChannel } from '@/lib/server/guilds/setting-checks';
import { getWebServices } from '@/lib/server/services';
import { pickFormFields, readFormFields, saveGuildSettings } from '@/lib/server/settings-action';

const EVENT_LOG_CHANNEL_FIELDS = [
  'messageChannelId',
  'memberChannelId',
  'serverChannelId',
  'voiceChannelId',
] as const;

export async function saveLoggingSettings(
  guildId: string,
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  return saveGuildSettings(guildId, 'logging', pickFormFields(formData, ['logChannelId']));
}

/** Errors for each of the four event log channels that is not a text channel of this server. */
async function checkEventLogChannels(guildId: string, patch: Record<string, unknown>) {
  const { guildResources } = await getWebServices();
  const results = await Promise.all(
    EVENT_LOG_CHANNEL_FIELDS.map((field) =>
      checkMessageChannel(guildResources, guildId, field, patch),
    ),
  );
  return Object.assign({}, ...results) as Record<string, string[]>;
}

export async function saveEventLogSettings(
  guildId: string,
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  return saveGuildSettings(
    guildId,
    'eventlogs',
    readFormFields(formData, {
      text: [...EVENT_LOG_CHANNEL_FIELDS],
      list: ['ignoredChannelIds'],
      flag: ['ignoreBots'],
    }),
    { check: (patch) => checkEventLogChannels(guildId, patch) },
  );
}
