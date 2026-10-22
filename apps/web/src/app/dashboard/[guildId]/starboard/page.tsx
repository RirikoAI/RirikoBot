import type { Metadata } from 'next';
import { MAX_STARBOARD_IGNORED_CHANNELS, MAX_STARBOARD_THRESHOLD } from '@ririko/core';
import { ChannelListField, ChannelSelectField } from '@/components/guild-pickers';
import { NumberField, SettingsForm, TextField, ToggleField } from '@/components/settings-form';
import { requireGuildAccess } from '@/lib/server/guilds/require-guild-access';
import { getWebServices } from '@/lib/server/services';
import { saveStarboardSettings } from './actions';

export const metadata: Metadata = { title: 'Starboard · Ririko Dashboard' };

export default async function StarboardSettingsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const { guildConfig } = await getWebServices();
  const values = await guildConfig.get(guildId, 'starboard');

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Starboard</h1>
        <p className="mt-1 text-sm text-zinc-400">
          When a message gets enough stars, Ririko posts a copy of it in the starboard channel: an
          embed with the author, the text, the first image and a link to the original. The star
          count on the copy follows every new and removed star. Ririko removes the copy when the
          original is deleted or its stars fall below the number needed. If staff delete a copy,
          that message is never posted again.
        </p>
      </header>
      <SettingsForm action={saveStarboardSettings.bind(null, guildId)}>
        <ChannelSelectField
          guildId={guildId}
          name="channelId"
          label="Starboard channel"
          description="Where the copies are posted. Choose Off to turn the starboard off; copies already posted stay. Ririko needs View Channel, Send Messages, Embed Links and Read Message History there. Messages from age-restricted channels are posted only if this channel is age-restricted too."
          defaultValue={values.channelId}
          emptyLabel="Off"
        />
        <TextField
          name="emoji"
          label="Emoji"
          description="The reaction that counts as a star: one emoji, such as ⭐, or a custom server emoji written as <:name:id> (animated: <a:name:id>). To get the custom emoji text, type a backslash before the emoji in Discord, like \:name:. Stars on the copy itself are not counted."
          defaultValue={values.emoji}
          maxLength={64}
        />
        <NumberField
          name="threshold"
          label="Stars needed"
          description={`How many stars a message needs before it is posted, from 1 to ${MAX_STARBOARD_THRESHOLD}.`}
          min={1}
          max={MAX_STARBOARD_THRESHOLD}
          defaultValue={values.threshold}
        />
        <ToggleField
          name="allowSelfStar"
          label="Count the author's own star"
          description="Off by default: a member cannot star their own message. Bots' stars never count."
          defaultValue={values.allowSelfStar}
        />
        <ChannelListField
          guildId={guildId}
          name="ignoredChannelIds"
          label="Ignored channels"
          description={`Messages in these channels, and in the threads under them, are never posted. Up to ${MAX_STARBOARD_IGNORED_CHANNELS} channels.`}
          defaultValue={values.ignoredChannelIds}
        />
      </SettingsForm>
    </section>
  );
}
