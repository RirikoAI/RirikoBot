import type { Metadata } from 'next';
import { DEFAULT_ESCALATION_STEPS } from '@ririko/core';
import { SettingsForm } from '@/components/settings-form';
import { requireGuildAccess } from '@/lib/server/guilds/require-guild-access';
import { getWebServices } from '@/lib/server/services';
import { saveModerationSettings } from './actions';
import { EscalationStepsField } from './escalation-steps-field';

export const metadata: Metadata = { title: 'Moderation · Ririko Dashboard' };

export default async function ModerationSettingsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const { guildConfig } = await getWebServices();
  const values = await guildConfig.get(guildId, 'moderation');

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Moderation</h1>
        <p className="mt-1 text-sm text-zinc-400">
          What happens as members collect warnings from <code>/warn</code> and AutoMod.
        </p>
      </header>
      <div className="flex max-w-2xl flex-col gap-2 rounded-md border border-edge p-4 text-sm text-zinc-300">
        <p>
          Every warning adds its severity (1 by default) to the member’s warning points. Warnings
          expire after 30 days, so points drop again over time.
        </p>
        <p>
          Kicks and bans from a step run with the permissions of the moderator who gave the warning,
          and with Ririko’s own for AutoMod. Saving this policy asks you to confirm with your
          passkey.
        </p>
      </div>
      <SettingsForm action={saveModerationSettings.bind(null, guildId)}>
        <EscalationStepsField
          defaultValue={values.escalationSteps}
          defaultPolicy={DEFAULT_ESCALATION_STEPS.map((step) => ({ ...step }))}
        />
      </SettingsForm>
    </section>
  );
}
