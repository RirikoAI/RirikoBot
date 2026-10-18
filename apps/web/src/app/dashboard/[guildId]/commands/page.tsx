import type { Metadata } from 'next';
import { COMMAND_OVERRIDE_EXEMPT } from '@ririko/core';
import { SettingsForm } from '@/components/settings-form';
import { requireGuildAccess } from '@/lib/server/guilds/require-guild-access';
import { getWebServices } from '@/lib/server/services';
import { saveCommandOverrides } from './actions';
import { CommandOverridesField } from './command-overrides-field';

export const metadata: Metadata = { title: 'Commands · Ririko Dashboard' };

export default async function CommandOverridesPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const { guildConfig, commandCatalog, guildResources } = await getWebServices();
  const [values, commands, roles, channels] = await Promise.all([
    guildConfig.get(guildId, 'commands'),
    commandCatalog.list(),
    guildResources.memberRoles(guildId),
    guildResources.messageChannels(guildId),
  ]);
  const catalog = commands.filter((command) => !COMMAND_OVERRIDE_EXEMPT.includes(command.name));

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Commands</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Turn commands off, limit them to certain roles, or change their cooldown, for the whole
          server or for one channel. Rules apply to slash and prefix commands alike.
        </p>
      </header>
      <div className="flex max-w-2xl flex-col gap-2 rounded-md border border-edge p-4 text-sm text-zinc-300">
        <p>
          Members with Manage Server ignore these rules, so staff cannot lock themselves out.
          Cooldowns apply to everyone and count per member. Threads follow the rules of their
          channel.
        </p>
        <p>Always available: {COMMAND_OVERRIDE_EXEMPT.map((name) => `/${name}`).join(', ')}.</p>
      </div>
      {catalog.length === 0 ? (
        <p className="max-w-2xl rounded-md border border-edge p-4 text-sm text-zinc-300">
          Ririko has not recorded its commands yet. Start the bot once, then reload this page.
        </p>
      ) : (
        <SettingsForm action={saveCommandOverrides.bind(null, guildId)}>
          <CommandOverridesField
            defaultValue={values.overrides}
            catalog={catalog.map((command) => ({
              name: command.name,
              category: command.category,
              description: command.description,
              cooldownSeconds: command.cooldownSeconds,
              defaultPermission: command.defaultPermission,
            }))}
            roles={roles.map((role) => ({ value: role.id, label: `@${role.name}` }))}
            channels={channels.map((channel) => ({
              value: channel.id,
              label: `#${channel.name}`,
              group: channel.category,
            }))}
          />
        </SettingsForm>
      )}
    </section>
  );
}
