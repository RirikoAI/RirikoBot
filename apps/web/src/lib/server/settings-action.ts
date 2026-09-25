import 'server-only';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import type { GuildConfigModule } from '@ririko/core';
import { GuildConfigValidationError } from '@ririko/services/guild';
import type { SettingsFormState } from '@/lib/settings-form-state';
import { clientIp, isSameOrigin, userAgent } from './auth/request';
import { requireGuildAccess } from './guilds/require-guild-access';
import { getWebServices } from './services';

/** String values of the named fields that were submitted; absent fields keep their value. */
export function pickFormFields(
  formData: FormData,
  names: readonly string[],
): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const name of names) {
    const value = formData.get(name);
    if (typeof value === 'string') fields[name] = value;
  }
  return fields;
}

/**
 * The body of every settings Server Action. Server Actions are public endpoints, so the guild
 * ID is checked here on every call: dashboard Origin, then `requireGuildAccess`, then the
 * shared schema inside `GuildConfigService`, which also writes the audit entry.
 */
export async function saveGuildSettings(
  guildId: string,
  module: GuildConfigModule,
  patch: Record<string, string>,
): Promise<SettingsFormState> {
  const requestHeaders = await headers();
  const { config, guildConfig } = await getWebServices();
  if (!isSameOrigin(requestHeaders, config.DASHBOARD_URL)) {
    return { status: 'error', message: 'This request did not come from the dashboard.' };
  }
  const { session } = await requireGuildAccess(guildId);

  try {
    const { values, changes } = await guildConfig.update(guildId, module, patch, {
      userId: session.userId,
      source: 'dashboard',
      ipAddress: clientIp(requestHeaders),
      userAgent: userAgent(requestHeaders),
    });
    revalidatePath(`/dashboard/${guildId}`, 'layout');
    return {
      status: 'saved',
      message: changes.length > 0 ? 'Settings saved.' : 'Nothing changed.',
      values,
    };
  } catch (error) {
    if (error instanceof GuildConfigValidationError) {
      return {
        status: 'error',
        message: 'Please fix the highlighted fields.',
        fieldErrors: error.fieldErrors,
        values: patch,
      };
    }
    throw error;
  }
}
