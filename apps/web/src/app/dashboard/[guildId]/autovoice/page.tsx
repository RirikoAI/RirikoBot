import type { Metadata } from 'next';
import { SettingsForm } from '@/components/settings-form';
import { requireGuildAccess } from '@/lib/server/guilds/require-guild-access';
import { getWebServices } from '@/lib/server/services';
import { saveAutoVoiceSettings } from './actions';
import { AutoVoiceHubsField } from './auto-voice-hubs-field';

export const metadata: Metadata = { title: 'Auto Voice · Ririko Dashboard' };

export default async function AutoVoiceSettingsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const { guildConfig, guildResources } = await getWebServices();
  const [values, channels, maxBitrate] = await Promise.all([
    guildConfig.get(guildId, 'autovoice'),
    guildResources.voiceChannels(guildId),
    guildResources.maxBitrate(guildId),
  ]);

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Auto Voice</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Join-to-create hubs: a member who joins a hub gets their own temporary voice channel next
          to it.
        </p>
      </header>
      <div className="flex max-w-2xl flex-col gap-2 rounded-md border border-edge p-4 text-sm text-zinc-300">
        <p>
          The new channel copies the hub’s permissions and category, and its owner can manage it
          with <code>/voice</code>. Ririko deletes it once it is empty.
        </p>
        <p>
          Ririko only ever deletes channels it created. Other channels in the hub’s category are
          never touched.
        </p>
        <p>
          Ririko needs Manage Channels and Move Members. If the server loses boosts, new channels
          use the highest bitrate the server still allows.
        </p>
      </div>
      <SettingsForm action={saveAutoVoiceSettings.bind(null, guildId)}>
        <AutoVoiceHubsField
          defaultValue={values.hubs}
          channels={channels.map((channel) => ({
            value: channel.id,
            label: `🔊 ${channel.name}`,
            group: channel.category,
          }))}
          maxBitrate={maxBitrate}
        />
      </SettingsForm>
    </section>
  );
}
