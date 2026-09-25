import type { Metadata } from 'next';
import { SettingsForm, TextField } from '@/components/settings-form';
import { requireGuildAccess } from '@/lib/server/guilds/require-guild-access';
import { getWebServices } from '@/lib/server/services';
import { saveGeneralSettings } from './actions';

export const metadata: Metadata = { title: 'General · Ririko Dashboard' };

const TIME_ZONES = ['UTC', ...Intl.supportedValuesOf('timeZone')];

export default async function GeneralSettingsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const { guildConfig } = await getWebServices();
  const values = await guildConfig.get(guildId, 'general');

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">General</h1>
        <p className="mt-1 text-sm text-zinc-400">
          The same settings as <code>/prefix</code> and <code>/timezone</code>.
        </p>
      </header>
      <SettingsForm action={saveGeneralSettings.bind(null, guildId)}>
        <TextField
          name="prefix"
          label="Command prefix"
          description="Starts text commands, as in !help. Slash commands are not affected. 1 to 5 characters, no spaces."
          defaultValue={values.prefix}
          maxLength={5}
        />
        <TextField
          name="timezone"
          label="Time zone"
          description="IANA name such as Asia/Kuala_Lumpur. Used for reminders and the times Ririko shows in this server."
          defaultValue={values.timezone}
          list="iana-time-zones"
        />
        <datalist id="iana-time-zones">
          {TIME_ZONES.map((zone) => (
            <option key={zone} value={zone} />
          ))}
        </datalist>
      </SettingsForm>
    </section>
  );
}
