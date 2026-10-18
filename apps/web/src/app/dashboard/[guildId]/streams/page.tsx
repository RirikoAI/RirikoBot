import type { Metadata } from 'next';
import Link from 'next/link';
import { integrationStatus } from '@ririko/core';
import {
  DEFAULT_STREAM_TEMPLATE,
  formatStreamAnnouncement,
  MAX_STREAM_SUBSCRIPTIONS,
  MAX_STREAM_TEMPLATE_LENGTH,
  STREAM_PLATFORM_LABELS,
  STREAM_PLATFORMS,
  STREAM_TEMPLATE_VARIABLES,
  type StreamAlert,
} from '@ririko/services/stream-alerts';
import { ChannelSelectField, MemberRoleSelectField } from '@/components/guild-pickers';
import {
  ActionButtonForm,
  SelectField,
  SettingsForm,
  TextAreaField,
  TextField,
} from '@/components/settings-form';
import { requireGuildAccess } from '@/lib/server/guilds/require-guild-access';
import { getWebServices } from '@/lib/server/services';
import { removeStreamAlert, saveStreamAlert } from './actions';

export const metadata: Metadata = { title: 'Stream Alerts · Ririko Dashboard' };

const PLATFORM_OPTIONS = STREAM_PLATFORMS.map((platform) => ({
  value: platform,
  label: STREAM_PLATFORM_LABELS[platform],
}));

/** The message a subscription posts, with example stream values. */
function previewMessage(alert: StreamAlert): string {
  const name = alert.streamer.displayName || alert.streamer.username;
  return formatStreamAnnouncement(alert.subscription.customMessage, {
    streamer: name,
    title: 'Example stream title',
    game: 'Just Chatting',
    platform: alert.streamer.platform,
    url: `https://example.com/${alert.streamer.username}`,
    mentionRoleId: alert.subscription.mentionRoleId,
  });
}

/** Channel and role mentions in a preview, shown as names. */
function readableMentions(
  text: string,
  channels: Map<string, string>,
  roles: Map<string, string>,
): string {
  return text
    .replace(/<#(\d+)>/g, (_match, id: string) => `#${channels.get(id) ?? 'deleted-channel'}`)
    .replace(/<@&(\d+)>/g, (_match, id: string) => `@${roles.get(id) ?? 'deleted-role'}`);
}

export default async function StreamAlertsPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ edit?: string | string[] }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const edit = (await searchParams).edit;
  const editId = typeof edit === 'string' ? edit : undefined;
  const { config, guildResources, streamAlerts } = await getWebServices();
  const [alerts, channels, roles] = await Promise.all([
    streamAlerts.list(guildId),
    guildResources.channelNames(guildId),
    guildResources.memberRoles(guildId),
  ]);
  const roleNames = new Map(roles.map((role) => [role.id, role.name]));
  const editing = editId
    ? (alerts.find((alert) => alert.subscription.id === editId) ?? null)
    : null;
  const twitchConfigured =
    integrationStatus(config).find((status) => status.id === 'streams.twitch')?.configured ?? false;
  const full = alerts.length >= MAX_STREAM_SUBSCRIPTIONS;

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Stream Alerts</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Ririko posts in a channel when a Twitch, YouTube or TikTok streamer goes live. A server
          can follow up to {MAX_STREAM_SUBSCRIPTIONS} streamers. <code>/stream</code> manages the
          same list.
        </p>
      </header>
      {twitchConfigured ? null : (
        <p role="alert" className="max-w-2xl text-sm text-amber-300">
          Twitch is not configured for this bot, so Twitch streamers are not checked. YouTube and
          TikTok work without keys.
        </p>
      )}

      <section aria-labelledby="alerts-heading" className="flex max-w-3xl flex-col gap-3">
        <h2 id="alerts-heading" className="text-lg font-semibold">
          Followed streamers ({alerts.length}/{MAX_STREAM_SUBSCRIPTIONS})
        </h2>
        {alerts.length === 0 ? (
          <p className="text-sm text-zinc-400">This server does not follow any streamers yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {alerts.map((alert) => (
              <li
                key={alert.subscription.id}
                className="flex flex-col gap-2 rounded-md border border-edge p-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full border border-edge px-2 py-0.5 text-xs text-zinc-400">
                    {STREAM_PLATFORM_LABELS[
                      alert.streamer.platform as keyof typeof STREAM_PLATFORM_LABELS
                    ] ?? alert.streamer.platform}
                  </span>
                  <span className="font-medium text-zinc-100">
                    {alert.streamer.displayName || alert.streamer.username}
                  </span>
                  {alert.streamer.isLive ? (
                    <span className="text-xs font-semibold text-red-300">LIVE</span>
                  ) : null}
                  <span className="text-zinc-400">
                    in{' '}
                    {channels.has(alert.subscription.channelId)
                      ? `#${channels.get(alert.subscription.channelId)}`
                      : 'a deleted channel'}
                    {alert.subscription.mentionRoleId
                      ? `, mentions @${roleNames.get(alert.subscription.mentionRoleId) ?? 'a deleted role'}`
                      : ''}
                  </span>
                  <div className="ml-auto flex flex-wrap items-center gap-1">
                    <Link
                      href={`/dashboard/${guildId}/streams?edit=${alert.subscription.id}#form-heading`}
                      className="px-2 py-1 underline"
                    >
                      Edit
                    </Link>
                    <ActionButtonForm
                      action={removeStreamAlert.bind(null, guildId)}
                      fields={{ subscriptionId: alert.subscription.id }}
                      label="Remove"
                      confirmMessage={`Stop announcing ${alert.streamer.displayName || alert.streamer.username} on this server?`}
                    />
                  </div>
                </div>
                <p className="whitespace-pre-wrap rounded bg-black/20 p-2 text-zinc-300">
                  {readableMentions(previewMessage(alert), channels, roleNames)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="form-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="form-heading" className="text-lg font-semibold">
            {editing
              ? `Edit ${editing.streamer.displayName || editing.streamer.username}`
              : 'Follow a streamer'}
          </h2>
          {editId ? (
            <Link href={`/dashboard/${guildId}/streams`} className="text-sm underline">
              Cancel editing
            </Link>
          ) : null}
        </div>
        {editId && !editing ? (
          <p role="alert" className="text-sm text-red-300">
            That subscription no longer exists.
          </p>
        ) : null}
        {!editing && full ? (
          <p className="text-sm text-zinc-400">
            This server follows {MAX_STREAM_SUBSCRIPTIONS} streamers, the most it can. Remove one to
            follow another.
          </p>
        ) : (
          <SettingsForm
            key={editing ? editing.subscription.id : 'new'}
            action={saveStreamAlert.bind(null, guildId)}
            submitLabel={editing ? 'Save subscription' : 'Follow streamer'}
          >
            {editing ? (
              <input type="hidden" name="subscriptionId" value={editing.subscription.id} />
            ) : (
              <>
                <TextField
                  name="streamer"
                  label="Streamer"
                  description="A name, @handle, YouTube channel ID or profile link, such as https://twitch.tv/shroud."
                  defaultValue=""
                  maxLength={200}
                />
                <SelectField
                  name="platform"
                  label="Platform"
                  description="Leave on automatic to take it from the link. A bare name is Twitch."
                  defaultValue=""
                  emptyLabel="Automatic"
                  options={PLATFORM_OPTIONS}
                />
              </>
            )}
            <ChannelSelectField
              guildId={guildId}
              name="channelId"
              label="Announcement channel"
              description="Ririko needs to send messages, embed links and attach files there."
              defaultValue={editing?.subscription.channelId ?? null}
            />
            <MemberRoleSelectField
              guildId={guildId}
              name="mentionRoleId"
              label="Role to mention"
              description="Only this role is pinged. Put {role} in the message to choose where; the default message starts with it."
              defaultValue={editing?.subscription.mentionRoleId ?? null}
              emptyLabel="No role"
            />
            <TextAreaField
              name="customMessage"
              label="Announcement message"
              description={`Empty uses the default: ${DEFAULT_STREAM_TEMPLATE.replace('\n', ' ')}. Variables: ${STREAM_TEMPLATE_VARIABLES.map((name) => `{${name}}`).join(', ')}. At most ${MAX_STREAM_TEMPLATE_LENGTH} characters.`}
              defaultValue={editing?.subscription.customMessage ?? ''}
              maxLength={MAX_STREAM_TEMPLATE_LENGTH}
              rows={3}
            />
          </SettingsForm>
        )}
      </section>
    </section>
  );
}
