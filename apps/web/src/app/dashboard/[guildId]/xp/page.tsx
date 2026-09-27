import type { Metadata } from 'next';
import { MAX_XP_RATE_PERCENT } from '@ririko/core';
import { ChannelListField, ChannelSelectField, RoleListField } from '@/components/guild-pickers';
import { NumberField, SettingsForm, ToggleField } from '@/components/settings-form';
import { requireGuildAccess } from '@/lib/server/guilds/require-guild-access';
import { getWebServices } from '@/lib/server/services';
import { saveXpSettings } from './actions';

export const metadata: Metadata = { title: 'XP & Ranking · Ririko Dashboard' };

export default async function XpSettingsPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const { guildConfig } = await getWebServices();
  const values = await guildConfig.get(guildId, 'xp');

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">XP &amp; Ranking</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Members earn 15 to 25 XP for a message, at most once a minute. Levels and ranks on this
          server come from that XP.
        </p>
      </header>
      <SettingsForm action={saveXpSettings.bind(null, guildId)}>
        <ToggleField
          name="levelUpAnnouncements"
          label="Announce level-ups"
          description="Members who turned level-up messages off for themselves are never announced."
          defaultValue={values.levelUpAnnouncements}
        />
        <ChannelSelectField
          guildId={guildId}
          name="levelUpChannelId"
          label="Level-up channel"
          description="Where level-up messages go. Without one, Ririko posts in the channel where the member levelled up; level-ups from voice are only announced here."
          defaultValue={values.levelUpChannelId}
          emptyLabel="Where the member levelled up"
        />
        <NumberField
          name="xpRatePercent"
          label="XP rate (%)"
          description={`100 is normal, 200 doubles XP, 0 turns XP off. At most ${MAX_XP_RATE_PERCENT}. Levels also raise a member's bank capacity everywhere, so the rate is capped.`}
          min={0}
          max={MAX_XP_RATE_PERCENT}
          defaultValue={values.xpRatePercent}
        />
        <ChannelListField
          guildId={guildId}
          includeVoice
          name="noXpChannelIds"
          label="No-XP channels"
          description="Messages here, in their threads, and time in these voice channels earn no XP. Up to 50."
          defaultValue={values.noXpChannelIds}
        />
        <RoleListField
          guildId={guildId}
          name="noXpRoleIds"
          label="No-XP roles"
          description="Members with any of these roles earn no XP. Up to 25."
          defaultValue={values.noXpRoleIds}
        />
        <ToggleField
          name="voiceXpEnabled"
          label="Voice rewards"
          description="Members earn 35 credits and 40 XP (at the rate above) for each minute in a voice channel with at least one other member who is not muted or deafened. The server's AFK channel never counts."
          defaultValue={values.voiceXpEnabled}
        />
      </SettingsForm>
    </section>
  );
}
