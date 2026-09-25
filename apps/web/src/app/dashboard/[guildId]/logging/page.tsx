import type { Metadata } from 'next';
import { ChannelSelectField } from '@/components/guild-pickers';
import { SettingsForm } from '@/components/settings-form';
import { requireGuildAccess } from '@/lib/server/guilds/require-guild-access';
import { getWebServices } from '@/lib/server/services';
import { saveLoggingSettings } from './actions';

export const metadata: Metadata = { title: 'Logging · Ririko Dashboard' };

export default async function LoggingSettingsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const { guildConfig } = await getWebServices();
  const values = await guildConfig.get(guildId, 'logging');

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
    </section>
  );
}
