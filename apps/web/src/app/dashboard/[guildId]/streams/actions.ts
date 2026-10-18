'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import {
  parseStreamPlatform,
  StreamAlertError,
  type StreamAlertActor,
} from '@ririko/services/stream-alerts';
import type { SettingsFormState } from '@/lib/settings-form-state';
import { checkMemberRole, checkMessageChannel } from '@/lib/server/guilds/setting-checks';
import { requireGuildAccess } from '@/lib/server/guilds/require-guild-access';
import { checkDashboardRequest, requestActor } from '@/lib/server/request-context';
import { getWebServices } from '@/lib/server/services';

const FIELDS = [
  'subscriptionId',
  'streamer',
  'platform',
  'channelId',
  'mentionRoleId',
  'customMessage',
];

/** The dashboard request check and guild access; returns the actor or the refusal. */
async function authorize(guildId: string, values: Record<string, unknown>) {
  const rejected = await checkDashboardRequest();
  if (rejected) {
    return { refused: { status: 'error', message: rejected, values } as SettingsFormState };
  }
  const { session } = await requireGuildAccess(guildId);
  const actor: StreamAlertActor = {
    userId: session.userId,
    source: 'dashboard',
    ...(await requestActor()),
  };
  return { actor };
}

/** After a change: the log channel notice (after the response) and a fresh page. */
async function announce(
  guildId: string,
  userId: string,
  field: string,
  previous: unknown,
  next: unknown,
) {
  const { notifier } = await getWebServices();
  const change = { userId, module: 'streams', changes: [{ field, before: previous, after: next }] };
  after(() => notifier.guildSettingsChanged(guildId, change));
  revalidatePath(`/dashboard/${guildId}/streams`);
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/** Adds a streamer, or changes the channel, role and message of an existing subscription. */
export async function saveStreamAlert(
  guildId: string,
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const values = Object.fromEntries(FIELDS.map((name) => [name, text(formData, name)]));
  const auth = await authorize(guildId, values);
  if (auth.refused) return auth.refused;

  const { guildResources, streamAlerts } = await getWebServices();
  let fieldErrors: Record<string, string[]>;
  try {
    const [channelErrors, roleErrors] = await Promise.all([
      checkMessageChannel(guildResources, guildId, 'channelId', values),
      checkMemberRole(guildResources, guildId, 'mentionRoleId', values),
    ]);
    fieldErrors = { ...channelErrors, ...roleErrors };
  } catch (error) {
    console.error(`[web] Could not check stream alert fields for guild ${guildId}:`, error);
    return {
      status: 'error',
      message: 'Could not check the channels and roles with Discord. Try again in a moment.',
      values,
    };
  }
  if (!values.channelId) fieldErrors.channelId = ['Choose the channel for the announcements.'];
  if (!values.subscriptionId && !values.streamer) {
    fieldErrors.streamer = ['Enter a streamer name, handle, channel ID or profile link.'];
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { status: 'error', message: 'Please fix the highlighted fields.', fieldErrors, values };
  }

  const settings = {
    channelId: String(values.channelId),
    mentionRoleId: values.mentionRoleId ? String(values.mentionRoleId) : null,
    customMessage: values.customMessage ? String(values.customMessage) : null,
  };
  try {
    if (values.subscriptionId) {
      const before = await streamAlerts.get(guildId, String(values.subscriptionId));
      const { streamer, subscription } = await streamAlerts.update(
        guildId,
        String(values.subscriptionId),
        settings,
        auth.actor,
      );
      await announce(
        guildId,
        auth.actor.userId,
        `${streamer.platform} ${streamer.username}`,
        before ? summary(before.subscription) : null,
        summary(subscription),
      );
      return { status: 'saved', message: 'Subscription saved.', values };
    }

    const { alert, created } = await streamAlerts.subscribe(
      {
        guildId,
        streamer: String(values.streamer),
        platform: parseStreamPlatform(String(values.platform)),
        ...settings,
      },
      auth.actor,
    );
    await announce(
      guildId,
      auth.actor.userId,
      `${alert.streamer.platform} ${alert.streamer.username}`,
      null,
      summary(alert.subscription),
    );
    const name = alert.streamer.displayName || alert.streamer.username;
    return {
      status: 'saved',
      message: created
        ? `Now following ${name}.`
        : `This server already followed ${name}; its subscription was updated.`,
      values: {},
    };
  } catch (error) {
    if (error instanceof StreamAlertError) {
      return { status: 'error', message: error.message, values };
    }
    throw error;
  }
}

/** Stops announcing a streamer on this server. */
export async function removeStreamAlert(
  guildId: string,
  _previous: SettingsFormState,
  formData: FormData,
): Promise<SettingsFormState> {
  const subscriptionId = text(formData, 'subscriptionId');
  const auth = await authorize(guildId, { subscriptionId });
  if (auth.refused) return auth.refused;

  const { streamAlerts } = await getWebServices();
  try {
    const { subscription, streamer } = await streamAlerts.remove(
      guildId,
      subscriptionId,
      auth.actor,
    );
    await announce(
      guildId,
      auth.actor.userId,
      streamer ? `${streamer.platform} ${streamer.username}` : 'subscription',
      summary(subscription),
      null,
    );
    return { status: 'saved', message: 'Subscription removed.', values: {} };
  } catch (error) {
    if (error instanceof StreamAlertError) return { status: 'error', message: error.message };
    throw error;
  }
}

function summary(subscription: {
  channelId: string;
  mentionRoleId: string | null;
  customMessage: string | null;
}) {
  return {
    channelId: subscription.channelId,
    mentionRoleId: subscription.mentionRoleId,
    customMessage: subscription.customMessage,
  };
}
