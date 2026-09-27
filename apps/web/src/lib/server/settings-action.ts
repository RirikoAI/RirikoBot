import 'server-only';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import type { GuildConfigModule } from '@ririko/core';
import { GuildConfigValidationError } from '@ririko/services/guild';
import { PASSKEY_REASON_MESSAGES } from '@/lib/passkey-action-result';
import type { SettingsFormState } from '@/lib/settings-form-state';
import { requireStepUp } from './auth/session';
import { requireGuildAccess } from './guilds/require-guild-access';
import { checkDashboardRequest, requestActor } from './request-context';
import { getWebServices } from './services';

const DISCORD_UNREACHABLE_MESSAGE =
  'Could not check the channels and roles with Discord. Try again in a moment.';

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
 * Typed values of the named fields: `text` fields as strings (absent ones keep their value),
 * `list` fields as every submitted string (none clears the list), and `flag` fields as
 * checkboxes (unchecked, so absent, is false).
 */
export function readFormFields(
  formData: FormData,
  fields: { text?: readonly string[]; list?: readonly string[]; flag?: readonly string[] },
): Record<string, unknown> {
  const values: Record<string, unknown> = pickFormFields(formData, fields.text ?? []);
  for (const name of fields.list ?? []) {
    values[name] = formData.getAll(name).filter((value) => typeof value === 'string');
  }
  for (const name of fields.flag ?? []) {
    values[name] = formData.get(name) === 'on';
  }
  return values;
}

/**
 * The body of every settings Server Action. Server Actions are public endpoints, so the guild
 * ID is checked here on every call: dashboard Origin and rate limit, then `requireGuildAccess`,
 * then the shared schema inside `GuildConfigService`, which also writes the audit entry. A save
 * that changes something is announced in the guild's log channel after the response is sent.
 * Sensitive modules pass `stepUp`, which also requires a passkey check from the last five
 * minutes; without one the form is told why, so it can run the check and submit again.
 */
export async function saveGuildSettings(
  guildId: string,
  module: GuildConfigModule,
  patch: Record<string, unknown>,
  options: {
    stepUp?: boolean;
    /**
     * Checks against Discord that the schema cannot make (a role Ririko can give, a channel of
     * the right type). Returns field errors; runs after the guards, before anything is written.
     */
    check?: (patch: Record<string, unknown>) => Promise<Record<string, string[]>>;
  } = {},
): Promise<SettingsFormState> {
  const rejected = await checkDashboardRequest();
  if (rejected) return { status: 'error', message: rejected };
  const { session } = await requireGuildAccess(guildId);
  if (options.stepUp) {
    const state = await requireStepUp(session);
    if (state !== 'ok') {
      return {
        status: 'error',
        message: PASSKEY_REASON_MESSAGES[state],
        reason: state,
        values: patch,
      };
    }
  }
  if (options.check) {
    let fieldErrors: Record<string, string[]>;
    try {
      fieldErrors = await options.check(patch);
    } catch (error) {
      console.error(`[web] Could not check ${module} settings for guild ${guildId}:`, error);
      return { status: 'error', message: DISCORD_UNREACHABLE_MESSAGE, values: patch };
    }
    if (Object.keys(fieldErrors).length > 0) {
      return {
        status: 'error',
        message: 'Please fix the highlighted fields.',
        fieldErrors,
        values: patch,
      };
    }
  }
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
