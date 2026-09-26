import type { Metadata } from 'next';
import { AssignableRoleListField, RoleSelectField } from '@/components/guild-pickers';
import { SettingsForm, ToggleField } from '@/components/settings-form';
import { requireGuildAccess } from '@/lib/server/guilds/require-guild-access';
import { getWebServices } from '@/lib/server/services';
import { saveAutoRoleSettings } from './actions';

export const metadata: Metadata = { title: 'Auto Roles · Ririko Dashboard' };

export default async function AutoRoleSettingsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const { guildConfig, guildResources } = await getWebServices();
  const [values, bot] = await Promise.all([
    guildConfig.get(guildId, 'autoroles'),
    guildResources.botRoleContext(guildId),
  ]);

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Auto Roles</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Roles Ririko gives members and bots when they join, and the role its verification button
          gives.
        </p>
      </header>
      <div className="flex max-w-2xl flex-col gap-2 rounded-md border border-edge p-4 text-sm text-zinc-300">
        {bot.canManageRoles ? null : (
          <p role="alert" className="text-amber-300">
            Ririko does not have the Manage Roles permission here, so it cannot give any role until
            it gets it.
          </p>
        )}
        <p>
          Ririko can only give roles below its highest role
          {bot.topRoleName ? (
            <>
              {' '}
              (<strong>@{bot.topRoleName}</strong>)
            </>
          ) : null}
          , and never roles managed by an integration. Move Ririko’s role up in Server Settings to
          offer more roles here.
        </p>
      </div>
      <SettingsForm action={saveAutoRoleSettings.bind(null, guildId)}>
        <ToggleField
          name="enabled"
          label="Give join roles"
          description="When off, members and bots who join get no roles. The verification button keeps working."
          defaultValue={values.enabled}
        />
        <AssignableRoleListField
          guildId={guildId}
          name="humanRoleIds"
          label="Roles for new members"
          description="Given to every member who joins. Up to 10 roles."
          defaultValue={values.humanRoleIds}
        />
        <AssignableRoleListField
          guildId={guildId}
          name="botRoleIds"
          label="Roles for new bots"
          description="Given to every bot added to the server. Up to 10 roles."
          defaultValue={values.botRoleIds}
        />
        <RoleSelectField
          guildId={guildId}
          name="verificationRoleId"
          label="Verification role"
          description="Given by the verification button. Post the button in a channel with /autorole send-verify."
          defaultValue={values.verificationRoleId}
          emptyLabel="No verification role"
        />
      </SettingsForm>
    </section>
  );
}
