'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { PASSKEY_REASON_MESSAGES } from '@/lib/passkey-action-result';
import type { SettingsFormState } from '@/lib/settings-form-state';
import { requireStepUp } from '@/lib/server/auth/session';
import { PanelError, type PanelChange } from '@/lib/server/guilds/reaction-role-panels';
import { requireGuildAccess } from '@/lib/server/guilds/require-guild-access';
import { checkDashboardRequest, requestActor } from '@/lib/server/request-context';
import type { DiscordNotifier } from '@/lib/server/discord-notifier';
import { getWebServices } from '@/lib/server/services';

/**
 * Every panel write sends or edits a message as Ririko, so each one needs the dashboard
 * request check, guild access and a passkey check from the last five minutes. Returns the
 * actor, or the form state that explains why not.
 */
async function authorizePanelWrite(guildId: string, values: Record<string, unknown>) {
  const rejected = await checkDashboardRequest();
  if (rejected) return { refused: { status: 'error', message: rejected } as SettingsFormState };
  const { session } = await requireGuildAccess(guildId);
  const stepUp = await requireStepUp(session);
  if (stepUp !== 'ok') {
    return {
      refused: {
        status: 'error',
        message: PASSKEY_REASON_MESSAGES[stepUp],
        reason: stepUp,
        values,
      } as SettingsFormState,
    };
  }
  return { actor: { userId: session.userId, ...(await requestActor()) } };
}

/** After a change: the log channel notice (after the response) and a fresh page. */
function announce(
  notifier: DiscordNotifier,
  guildId: string,
  userId: string,
  changes: PanelChange[],
): void {
  const change = { userId, module: 'reaction-roles', changes };
  after(() => notifier.guildSettingsChanged(guildId, change));
  revalidatePath(`/dashboard/${guildId}/reaction-roles`);
}

/** The submitted panel JSON with the published message filled in, so the next save edits it. */
function withMessageId(panel: unknown, messageId: string): unknown {
  if (typeof panel !== 'string') return panel;
  try {
    return JSON.stringify({ ...(JSON.parse(panel) as object), messageId });
  } catch {
    return panel;
  }
}

/** Posts a reaction role panel, or edits one Ririko already posted. */
export async function publishReactionRolePanel(
  guildId: string,
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const panel = formData.get('panel');
  const values = { panel };
  const auth = await authorizePanelWrite(guildId, values);
  if (auth.refused) return auth.refused;

  const { reactionRolePanels, notifier } = await getWebServices();
  try {
    const result = await reactionRolePanels.publish(guildId, panel, auth.actor);
    if (result.status === 'invalid') {
      return {
        status: 'error',
        message: 'Please fix the highlighted fields.',
        fieldErrors: { panel: result.errors },
        values,
      };
    }
    announce(notifier, guildId, auth.actor.userId, result.changes);
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

/** Removes one role from a panel, with its button, menu option or reaction. */
export async function removeReactionRoleBinding(
  guildId: string,
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const bindingId = String(formData.get('bindingId') ?? '');
  const auth = await authorizePanelWrite(guildId, { bindingId });
  if (auth.refused) return auth.refused;

  const { reactionRolePanels, notifier } = await getWebServices();
  try {
    const changes = await reactionRolePanels.removeBinding(guildId, bindingId, auth.actor);
    announce(notifier, guildId, auth.actor.userId, changes);
    return { status: 'saved', message: 'Role removed.', values: {} };
  } catch (error) {
    if (error instanceof PanelError) return { status: 'error', message: error.message };
    throw error;
  }
}

/** Removes every role from a message, and deletes the message when asked and it is Ririko's. */
export async function deleteReactionRolePanel(
  guildId: string,
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const messageId = String(formData.get('messageId') ?? '');
  const deleteMessage = formData.get('deleteMessage') === 'true';
  const auth = await authorizePanelWrite(guildId, { messageId });
  if (auth.refused) return auth.refused;

  const { reactionRolePanels, notifier } = await getWebServices();
  try {
    const changes = await reactionRolePanels.deletePanel(
      guildId,
      messageId,
      { deleteMessage },
      auth.actor,
    );
    announce(notifier, guildId, auth.actor.userId, changes);
    return { status: 'saved', message: 'Panel deleted.', values: {} };
  } catch (error) {
    if (error instanceof PanelError) return { status: 'error', message: error.message };
    throw error;
  }
}
