import type { Metadata } from 'next';
import { MAX_TCG_DROP_MESSAGE_THRESHOLD, MIN_TCG_DROP_MESSAGE_THRESHOLD } from '@ririko/core';
import { ChannelSelectField, MemberRoleSelectField } from '@/components/guild-pickers';
import { NumberField, SettingsForm, ToggleField } from '@/components/settings-form';
import { requireGuildAccess } from '@/lib/server/guilds/require-guild-access';
import { getWebServices } from '@/lib/server/services';
import { saveTcgSettings } from './actions';

export const metadata: Metadata = { title: 'Waifu TCG · Ririko Dashboard' };

export default async function TcgSettingsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const { guildConfig } = await getWebServices();
  const [values, general] = await Promise.all([
    guildConfig.get(guildId, 'tcg'),
    guildConfig.get(guildId, 'general'),
  ]);

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Waifu TCG</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Card drops reward active chat: once enough different members have chatted, a card drops
          and the first member to run <code>/card action:claim</code> keeps it. Game rules such as
          energy and market tax are the same on every server and are set by the bot owner.
        </p>
      </header>
      <SettingsForm action={saveTcgSettings.bind(null, guildId)}>
        <ToggleField
          name="dropsEnabled"
          label="Card drops"
          description="Drop cards in this server as members chat."
          defaultValue={values.dropsEnabled}
        />
        <ChannelSelectField
          guildId={guildId}
          name="dropChannelId"
          label="Drop channel"
          description="Only messages in this channel count, and cards drop here. Without one, every channel counts and the card drops where the last message was."
          defaultValue={values.dropChannelId}
          emptyLabel="Every channel"
        />
        <NumberField
          name="dropMessageThreshold"
          label="Members before a drop"
          description={`How many different members must chat before a card drops (${MIN_TCG_DROP_MESSAGE_THRESHOLD} to ${MAX_TCG_DROP_MESSAGE_THRESHOLD}). Messages Ririko treats as spam do not count.`}
          min={MIN_TCG_DROP_MESSAGE_THRESHOLD}
          max={MAX_TCG_DROP_MESSAGE_THRESHOLD}
          defaultValue={values.dropMessageThreshold}
        />
        <NumberField
          name="dropStartHour"
          label="Drops start at (hour)"
          description={`0 to 23 in the server time zone (${general.timezone}, set on the General page).`}
          min={0}
          max={23}
          defaultValue={values.dropStartHour}
        />
        <NumberField
          name="dropEndHour"
          label="Drops stop at (hour)"
          description="0 to 23. An end before the start runs past midnight (20 to 4); the same hour as the start means all day."
          min={0}
          max={23}
          defaultValue={values.dropEndHour}
        />
        <NumberField
          name="dropClaimTimeoutSeconds"
          label="Claim window (seconds)"
          description="How long a drop can be claimed, 15 to 600."
          min={15}
          max={600}
          defaultValue={values.dropClaimTimeoutSeconds}
        />
        <NumberField
          name="dropCooldownMinutes"
          label="Repeat-claim cooldown (minutes)"
          description="The member who claimed the last drop waits this long before claiming another, 0 to 60."
          min={0}
          max={60}
          defaultValue={values.dropCooldownMinutes}
        />
        <MemberRoleSelectField
          guildId={guildId}
          name="managerRoleId"
          label="TCG Manager Role"
          description="Members with this role can change these drop settings with /tcg-admin without Manage Server. Only members with Manage Server can change the role."
          defaultValue={values.managerRoleId}
          emptyLabel="None (Manage Server only)"
        />
      </SettingsForm>
    </section>
  );
}
