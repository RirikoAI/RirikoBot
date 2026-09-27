import type { Metadata } from 'next';
import { MAX_MUSIC_VOLUME } from '@ririko/core';
import { ChannelSelectField, MemberRoleSelectField } from '@/components/guild-pickers';
import { NumberField, SettingsForm, ToggleField } from '@/components/settings-form';
import { requireGuildAccess } from '@/lib/server/guilds/require-guild-access';
import { getWebServices } from '@/lib/server/services';
import { saveMusicSettings } from './actions';

export const metadata: Metadata = { title: 'Music · Ririko Dashboard' };

export default async function MusicSettingsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const { guildConfig } = await getWebServices();
  const values = await guildConfig.get(guildId, 'music');

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Music</h1>
        <p className="mt-1 text-sm text-zinc-400">
          How Ririko plays music in voice channels on this server.
        </p>
      </header>
      <SettingsForm action={saveMusicSettings.bind(null, guildId)}>
        <NumberField
          name="defaultVolume"
          label="Default volume (%)"
          description={`The volume a new music session starts at, 0 to ${MAX_MUSIC_VOLUME}. /volume changes it too.`}
          min={0}
          max={MAX_MUSIC_VOLUME}
          defaultValue={values.defaultVolume}
        />
        <ChannelSelectField
          guildId={guildId}
          name="musicChannelId"
          label="Music channel"
          description="Ririko posts a music controller here, and plays song names and links members send in it (their messages are deleted). Ririko needs to send and manage messages there. A previous controller message is not removed."
          defaultValue={values.musicChannelId}
          emptyLabel="No music channel"
        />
        <MemberRoleSelectField
          guildId={guildId}
          name="djRoleId"
          label="DJ role"
          description="With a DJ role, only its members and members with Manage Server can pause, skip, stop, go back, loop, shuffle, seek, use filters, change the volume or make Ririko leave, with commands or the controller buttons. Everyone can still add songs."
          defaultValue={values.djRoleId}
          emptyLabel="No DJ role (everyone can control playback)"
        />
        <ToggleField
          name="autoLeaveEmpty"
          label="Leave empty voice channels"
          description="Ririko stops the music and leaves 3 minutes after the last member (not counting bots) leaves its voice channel. Someone joining cancels it."
          defaultValue={values.autoLeaveEmpty}
        />
      </SettingsForm>
    </section>
  );
}
