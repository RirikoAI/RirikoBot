import type { Metadata } from 'next';
import { MAX_EVENT_LOG_IGNORED_CHANNELS } from '@ririko/core';
import { ChannelListField, ChannelSelectField } from '@/components/guild-pickers';
import { SettingsForm, ToggleField } from '@/components/settings-form';
import { requireGuildAccess } from '@/lib/server/guilds/require-guild-access';
import { getWebServices } from '@/lib/server/services';
import { saveEventLogSettings, saveLoggingSettings } from './actions';

export const metadata: Metadata = { title: 'Logging · Ririko Dashboard' };

export default async function LoggingSettingsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const { guildConfig } = await getWebServices();
  const [values, eventLogs] = await Promise.all([
    guildConfig.get(guildId, 'logging'),
    guildConfig.get(guildId, 'eventlogs'),
  ]);

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Logging</h1>
        <p className="mt-1 text-sm text-zinc-400">
          One channel receives every log Ririko writes for this server.
        </p>
      </header>
      <SettingsForm action={saveLoggingSettings.bind(null, guildId)}>
        <ChannelSelectField
          guildId={guildId}
          name="logChannelId"
          label="Log channel"
          description="Receives moderation cases (warnings, timeouts, kicks, bans), anti-raid alerts and notices of dashboard setting changes. Ririko needs View Channel, Send Messages and Embed Links there."
          defaultValue={values.logChannelId}
          emptyLabel="No log channel"
        />
      </SettingsForm>
      <header>
        <h2 className="text-xl font-bold">Event logs</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Record what happens in the server, each kind of event in its own channel. Leave a channel
          on Off to skip that kind. Ririko needs View Channel, Send Messages, Embed Links and Attach
          Files in each channel.
        </p>
      </header>
      <SettingsForm action={saveEventLogSettings.bind(null, guildId)}>
        <ChannelSelectField
          guildId={guildId}
          name="messageChannelId"
          label="Message log"
          description="Edited messages, deleted messages and bulk deletes. Ririko needs View Channel, Send Messages, Embed Links and Attach Files there."
          defaultValue={eventLogs.messageChannelId}
          emptyLabel="Off"
        />
        <ChannelSelectField
          guildId={guildId}
          name="memberChannelId"
          label="Member log"
          description="Joins, leaves, nickname and role changes, timeouts and bans. Ririko needs View Channel, Send Messages, Embed Links and Attach Files there."
          defaultValue={eventLogs.memberChannelId}
          emptyLabel="Off"
        />
        <ChannelSelectField
          guildId={guildId}
          name="serverChannelId"
          label="Server log"
          description="Channels and roles that are created, deleted or renamed. Ririko needs View Channel, Send Messages, Embed Links and Attach Files there."
          defaultValue={eventLogs.serverChannelId}
          emptyLabel="Off"
        />
        <ChannelSelectField
          guildId={guildId}
          name="voiceChannelId"
          label="Voice log"
          description="Members joining, leaving and moving between voice channels. Ririko needs View Channel, Send Messages, Embed Links and Attach Files there."
          defaultValue={eventLogs.voiceChannelId}
          emptyLabel="Off"
        />
        <ChannelListField
          guildId={guildId}
          name="ignoredChannelIds"
          label="Ignored channels"
          description={`Messages in these channels, and in the threads under them, are not logged. This includes the text chat of a voice channel you pick. Member, server and voice events are always logged. Up to ${MAX_EVENT_LOG_IGNORED_CHANNELS} channels.`}
          defaultValue={eventLogs.ignoredChannelIds}
          includeVoice
        />
        <ToggleField
          name="ignoreBots"
          label="Ignore bots' messages and voice activity"
          description="Messages and voice activity of bots are not logged. Member events for bots (joins, leaves, bans, roles) are always logged."
          defaultValue={eventLogs.ignoreBots}
        />
      </SettingsForm>
    </section>
  );
}
