import 'server-only';
import { notFound } from 'next/navigation';
import { GuildConfigValidationError, type GuildConfigActor } from '@ririko/services/guild';
import { PASSKEY_REASON_MESSAGES } from '@/lib/passkey-action-result';
import type { SettingsFormState } from '@/lib/settings-form-state';
import { isBotOwner, requireSession, requireStepUp } from './auth/session';
import { checkDashboardRequest, requestActor } from './request-context';

/**
 * The body of every owner console Server Action. Server Actions are public endpoints, so each
 * call checks the dashboard Origin and rate limit, then that the user is a bot owner (others
 * get a 404), then a passkey check from the last five minutes. Without one the form is told
 * why, so it can run the check and submit again. `write` runs only after all of that and gets
 * the actor for the audit entry; a schema error becomes field errors on the form.
 */
export async function runOwnerAction(
  values: Record<string, unknown>,
  write: (actor: GuildConfigActor) => Promise<SettingsFormState>,
): Promise<SettingsFormState> {
  const rejected = await checkDashboardRequest();
  if (rejected) return { status: 'error', message: rejected, values };
  const session = await requireSession('/owner');
  if (!(await isBotOwner(session.userId))) notFound();
  const stepUp = await requireStepUp(session);
  if (stepUp !== 'ok') {
    return { status: 'error', message: PASSKEY_REASON_MESSAGES[stepUp], reason: stepUp, values };
  }

  try {
    return await write({ userId: session.userId, source: 'dashboard', ...(await requestActor()) });
  } catch (error) {
    if (error instanceof GuildConfigValidationError) {
      return {
        status: 'error',
        message: 'Please fix the highlighted fields.',
        fieldErrors: error.fieldErrors,
        values,
      };
    }
    throw error;
  }
}
