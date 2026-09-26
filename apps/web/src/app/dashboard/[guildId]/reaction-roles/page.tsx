import type { Metadata } from 'next';
import { SettingsForm } from '@/components/settings-form';
import { requireGuildAccess } from '@/lib/server/guilds/require-guild-access';
import { getWebServices } from '@/lib/server/services';
import { publishReactionRolePanel } from './actions';
import { PanelBuilderField } from './panel-builder-field';

export const metadata: Metadata = { title: 'Reaction Roles · Ririko Dashboard' };

export default async function ReactionRolesPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const { guildResources } = await getWebServices();
  const [channels, roles, bot] = await Promise.all([
    guildResources.messageChannels(guildId),
    guildResources.assignableRoles(guildId),
    guildResources.botRoleContext(guildId),
  ]);

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Reaction Roles</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Post a message with role buttons or a role menu. Members click to get or drop roles.
        </p>
      </header>
      <div className="flex max-w-2xl flex-col gap-2 rounded-md border border-edge p-4 text-sm text-zinc-300">
        {bot.canManageRoles ? null : (
          <p role="alert" className="text-amber-300">
            Ririko does not have the Manage Roles permission here, so clicks will not give roles
            until it gets it.
          </p>
        )}
        <p>
          Ririko posts the panel itself, so it needs View Channel, Send Messages and Embed Links in
          that channel. It can only give roles below its highest role
          {bot.topRoleName ? (
            <>
              {' '}
              (<strong>@{bot.topRoleName}</strong>)
            </>
          ) : null}
          .
        </p>
        <p>Publishing sends a message as Ririko, so it asks you to confirm with your passkey.</p>
      </div>
      <SettingsForm
        action={publishReactionRolePanel.bind(null, guildId)}
        submitLabel="Publish panel"
      >
        <PanelBuilderField
          defaultValue={null}
          channels={channels.map((channel) => ({
            value: channel.id,
            label: `#${channel.name}`,
            group: channel.category,
          }))}
          roles={roles.map((role) => ({ value: role.id, label: `@${role.name}` }))}
        />
      </SettingsForm>
    </section>
  );
}
