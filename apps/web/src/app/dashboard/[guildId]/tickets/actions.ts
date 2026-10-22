'use server';

import type { SettingsFormState } from '@/lib/settings-form-state';
import { checkMessageChannel } from '@/lib/server/guilds/setting-checks';
import { getWebServices } from '@/lib/server/services';
import { readFormFields, saveGuildSettings } from '@/lib/server/settings-action';

/**
 * Errors for a category or transcript channel that is not of this server, or a staff role it
 * does not have. Staff roles only need to exist: Ririko never gives them.
 */
async function checkTicketSettings(guildId: string, patch: Record<string, unknown>) {
  const { guildResources } = await getWebServices();
  const errors = await checkMessageChannel(guildResources, guildId, 'transcriptChannelId', patch);

  const categoryId = typeof patch.categoryId === 'string' ? patch.categoryId.trim() : '';
  if (categoryId && !(await guildResources.categories(guildId)).some((c) => c.id === categoryId)) {
    errors.categoryId = ['Choose a category of this server.'];
  }

  const staff = Array.isArray(patch.staffRoleIds)
    ? patch.staffRoleIds.filter((id): id is string => typeof id === 'string')
    : [];
  if (staff.length > 0) {
    const known = new Set((await guildResources.memberRoles(guildId)).map((role) => role.id));
    const missing = staff.filter((id) => !known.has(id));
    if (missing.length > 0) {
      errors.staffRoleIds = missing.map((id) => `Role ${id} no longer exists.`);
    }
  }
  return errors;
}

export async function saveTicketSettings(
  guildId: string,
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  return saveGuildSettings(
    guildId,
    'tickets',
    readFormFields(formData, {
      text: ['categoryId', 'transcriptChannelId', 'maxOpenPerUser', 'welcomeMessage'],
      list: ['staffRoleIds'],
      flag: ['enabled'],
    }),
    { check: (patch) => checkTicketSettings(guildId, patch) },
  );
}
