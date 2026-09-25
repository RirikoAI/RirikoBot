import 'server-only';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import type { GuildConfigModule } from '@ririko/core';
import { GuildConfigValidationError } from '@ririko/services/guild';
import type { SettingsFormState } from '@/lib/settings-form-state';
import { requireGuildAccess } from './guilds/require-guild-access';
import { checkDashboardRequest, requestActor } from './request-context';
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
 * ID is checked here on every call: dashboard Origin and rate limit, then `requireGuildAccess`,
 * then the shared schema inside `GuildConfigService`, which also writes the audit entry. A save
 * that changes something is announced in the guild's log channel after the response is sent.
 */
export async function saveGuildSettings(
  guildId: string,
  module: GuildConfigModule,
  patch: Record<string, string>,
): Promise<SettingsFormState> {
  const rejected = await checkDashboardRequest();
  if (rejected) return { status: 'error', message: rejected };
  const { session } = await requireGuildAccess(guildId);
  const { guildConfig, notifier } = await getWebServices();

  try {
    const { values, changes } = await guildConfig.update(guildId, module, patch, {
      userId: session.userId,
      source: 'dashboard',
      ...(await requestActor()),
    });
    if (changes.length > 0) {
      const change = { userId: session.userId, module, changes };
      after(() => notifier.guildSettingsChanged(guildId, change));
    }
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
