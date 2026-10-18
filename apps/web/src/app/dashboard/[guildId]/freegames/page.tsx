import type { Metadata } from 'next';
import { ChannelSelectField, MemberRoleSelectField } from '@/components/guild-pickers';
import { SettingsForm } from '@/components/settings-form';
import { requireGuildAccess } from '@/lib/server/guilds/require-guild-access';
import { getWebServices } from '@/lib/server/services';
import { saveFreeGamesSettings } from './actions';

export const metadata: Metadata = { title: 'Free Games · Ririko Dashboard' };

export default async function FreeGamesSettingsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const { guildConfig } = await getWebServices();
  const values = await guildConfig.get(guildId, 'freegames');

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Free Games</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Ririko checks Epic Games Store and Steam every 30 minutes and announces each game that
          becomes free to keep, once per server. <code>/freegames</code> shows the current ones.
        </p>
      </header>
      <SettingsForm action={saveFreeGamesSettings.bind(null, guildId)}>
        <ChannelSelectField
          guildId={guildId}
          name="channelId"
          label="Announcement channel"
          description="Ririko needs to send messages and embed links there."
          defaultValue={values.channelId}
          emptyLabel="Off (no announcements)"
        />
        <MemberRoleSelectField
          guildId={guildId}
          name="pingRoleId"
          label="Ping role"
          description="Mentioned above each announcement. Only this role is pinged. It needs an announcement channel."
          defaultValue={values.pingRoleId}
          emptyLabel="No ping"
        />
      </SettingsForm>
    </section>
  );
}
