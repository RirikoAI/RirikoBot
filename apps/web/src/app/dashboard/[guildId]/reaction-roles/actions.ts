'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { PASSKEY_REASON_MESSAGES } from '@/lib/passkey-action-result';
import type { SettingsFormState } from '@/lib/settings-form-state';
import { requireStepUp } from '@/lib/server/auth/session';
import { PanelError } from '@/lib/server/guilds/reaction-role-panels';
import { requireGuildAccess } from '@/lib/server/guilds/require-guild-access';
import { checkDashboardRequest, requestActor } from '@/lib/server/request-context';
import { getWebServices } from '@/lib/server/services';

/** The submitted panel JSON with the published message filled in, so the next save edits it. */
function withMessageId(panel: unknown, messageId: string): unknown {
  if (typeof panel !== 'string') return panel;
  try {
    return JSON.stringify({ ...(JSON.parse(panel) as object), messageId });
  } catch {
    return panel;
  }
}

/**
 * Posts a reaction role panel, or edits one Ririko already posted. Publishing writes to Discord
 * with the bot token, so it needs a passkey check from the last five minutes.
 */
export async function publishReactionRolePanel(
  guildId: string,
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const rejected = await checkDashboardRequest();
  if (rejected) return { status: 'error', message: rejected };
  const { session } = await requireGuildAccess(guildId);
  const panel = formData.get('panel');
  const values = { panel };
  const stepUp = await requireStepUp(session);
  if (stepUp !== 'ok') {
    return { status: 'error', message: PASSKEY_REASON_MESSAGES[stepUp], reason: stepUp, values };
  }

  const { reactionRolePanels, notifier } = await getWebServices();
  try {
    const result = await reactionRolePanels.publish(guildId, panel, {
      userId: session.userId,
      ...(await requestActor()),
    });
    if (result.status === 'invalid') {
      return {
        status: 'error',
        message: 'Please fix the highlighted fields.',
        fieldErrors: { panel: result.errors },
        values,
      };
    }
    const change = { userId: session.userId, module: 'reaction-roles', changes: result.changes };
    after(() => notifier.guildSettingsChanged(guildId, change));
    revalidatePath(`/dashboard/${guildId}/reaction-roles`);
    return {
      status: 'saved',
      message: result.created ? 'Panel posted.' : 'Panel updated.',
      values: { panel: withMessageId(panel, result.messageId) },
    };
  } catch (error) {
    if (error instanceof PanelError) return { status: 'error', message: error.message, values };
    throw error;
  }
}
