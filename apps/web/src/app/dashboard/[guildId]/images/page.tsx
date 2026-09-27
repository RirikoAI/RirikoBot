import type { Metadata } from 'next';
import {
  configuredImageProviders,
  IMAGE_PROVIDER_LABELS,
  IMAGE_STYLE_PRESETS,
  MAX_IMAGE_MEMBER_DAILY_LIMIT,
} from '@ririko/core';
import { NumberField, SelectField, SettingsForm } from '@/components/settings-form';
import { requireGuildAccess } from '@/lib/server/guilds/require-guild-access';
import { getWebServices } from '@/lib/server/services';
import { saveImageSettings } from './actions';

export const metadata: Metadata = { title: 'Image Generation · Ririko Dashboard' };

export default async function ImageSettingsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const { config, guildConfig } = await getWebServices();
  const values = await guildConfig.get(guildId, 'images');
  const configured = configuredImageProviders(config);
  const botQuota = config.IMAGE_DAILY_QUOTA;

  const providers = configured.map((id) => ({ value: id, label: IMAGE_PROVIDER_LABELS[id] }));
  // Keep a saved provider that lost its credentials, so saving does not clear it.
  if (values.defaultProvider && !configured.includes(values.defaultProvider)) {
    providers.unshift({
      value: values.defaultProvider,
      label: `${IMAGE_PROVIDER_LABELS[values.defaultProvider]} (not configured)`,
    });
  }

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Image Generation</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Defaults for /imagine on this server. Members can still pick a provider and a style
          themselves.
        </p>
      </header>
      <SettingsForm action={saveImageSettings.bind(null, guildId)}>
        <SelectField
          name="defaultProvider"
          label="Default provider"
          description={
            configured.length > 0
              ? 'Used when a member picks none. If it fails, Ririko falls back to another provider.'
              : 'No image provider is configured for this bot, so /imagine uses the offline mock.'
          }
          defaultValue={values.defaultProvider ?? ''}
          emptyLabel="Bot default"
          options={providers}
        />
        <NumberField
          name="memberDailyLimit"
          label="Images per member (24 hours)"
          description={
            botQuota > 0
              ? `How many images each member may generate on this server in 24 hours, 1 to ${MAX_IMAGE_MEMBER_DAILY_LIMIT}. The bot allows ${botQuota} across all servers, and a higher value here has no effect. Leave it empty to use only that.`
              : `How many images each member may generate on this server in 24 hours, 1 to ${MAX_IMAGE_MEMBER_DAILY_LIMIT}. The bot sets no quota of its own. Leave it empty for no limit.`
          }
          min={1}
          max={MAX_IMAGE_MEMBER_DAILY_LIMIT}
          defaultValue={values.memberDailyLimit}
        />
        <SelectField
          name="defaultPreset"
          label="Default style"
          description="The style added to prompts when a member picks none."
          defaultValue={values.defaultPreset ?? ''}
          emptyLabel="Bot default (Anime Illustration)"
          options={IMAGE_STYLE_PRESETS.map((preset) => ({ value: preset.id, label: preset.label }))}
        />
      </SettingsForm>
    </section>
  );
}
