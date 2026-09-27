import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactionRolePanelInput } from '@ririko/core';
import { ActionButtonForm, SettingsForm } from '@/components/settings-form';
import { PanelError, type PanelSummary } from '@/lib/server/guilds/reaction-role-panels';
import { requireGuildAccess } from '@/lib/server/guilds/require-guild-access';
import { getWebServices } from '@/lib/server/services';
import {
  deleteReactionRolePanel,
  publishReactionRolePanel,
  removeReactionRoleBinding,
} from './actions';
import { PanelBuilderField } from './panel-builder-field';

export const metadata: Metadata = { title: 'Reaction Roles · Ririko Dashboard' };

const SNOWFLAKE = /^\d{17,20}$/;

const TYPE_LABELS: Record<string, string> = {
  BUTTON: 'Button',
  SELECT_MENU: 'Menu option',
  EMOJI: 'Reaction',
};

/** The panel to edit from `?edit=`, or why it cannot be edited. */
async function panelToEdit(
  guildId: string,
  messageId: string | undefined,
): Promise<{ panel: ReactionRolePanelInput | null; problem: string | null }> {
  if (!messageId || !SNOWFLAKE.test(messageId)) return { panel: null, problem: null };
  const { reactionRolePanels } = await getWebServices();
  try {
    const panel = await reactionRolePanels.loadPanel(guildId, messageId);
    return panel
      ? { panel, problem: null }
      : { panel: null, problem: 'That message has no role buttons or menu to edit.' };
  } catch (error) {
    if (error instanceof PanelError) {
      return { panel: null, problem: `${error.message} You can still remove its roles below.` };
    }
    throw error;
  }
}

export default async function ReactionRolesPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ edit?: string | string[] }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const edit = (await searchParams).edit;
  const editId = typeof edit === 'string' ? edit : undefined;
  const { guildResources, reactionRolePanels } = await getWebServices();
  const [channels, roles, bot, panels, editing] = await Promise.all([
    guildResources.messageChannels(guildId),
    guildResources.assignableRoles(guildId),
    guildResources.botRoleContext(guildId),
    reactionRolePanels.listPanels(guildId),
    panelToEdit(guildId, editId),
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
        <p>
          Publishing, editing and removing send or change a message as Ririko, so they ask you to
          confirm with your passkey.
        </p>
      </div>

      <section aria-labelledby="panels-heading" className="flex max-w-3xl flex-col gap-3">
        <h2 id="panels-heading" className="text-lg font-semibold">
          Panels
        </h2>
        {panels.length === 0 ? (
          <p className="text-sm text-zinc-400">No reaction roles yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {panels.map((panel) => (
              <PanelCard key={panel.messageId} guildId={guildId} panel={panel} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="builder-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="builder-heading" className="text-lg font-semibold">
            {editing.panel ? 'Edit panel' : 'New panel'}
          </h2>
          {editId ? (
            <Link href={`/dashboard/${guildId}/reaction-roles`} className="text-sm underline">
              Cancel editing
            </Link>
          ) : null}
        </div>
        {editing.problem ? (
          <p role="alert" className="text-sm text-red-300">
            {editing.problem}
          </p>
        ) : null}
        <SettingsForm
          key={editing.panel ? editId : 'new'}
          action={publishReactionRolePanel.bind(null, guildId)}
          submitLabel={editing.panel ? 'Update panel' : 'Publish panel'}
        >
          <PanelBuilderField
            defaultValue={editing.panel}
            channels={channels.map((channel) => ({
              value: channel.id,
              label: `#${channel.name}`,
              group: channel.category,
            }))}
            roles={roles.map((role) => ({ value: role.id, label: `@${role.name}` }))}
          />
        </SettingsForm>
      </section>
    </section>
  );
}

function PanelCard({ guildId, panel }: { guildId: string; panel: PanelSummary }) {
  return (
    <li className="flex flex-col gap-2 rounded-md border border-edge p-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-medium">
          {panel.channelName ? `#${panel.channelName}` : 'Deleted channel'}
        </span>
        <a href={panel.url} target="_blank" rel="noreferrer" className="text-sakura underline">
          Open in Discord
        </a>
        {panel.editable ? (
          <Link
            href={`/dashboard/${guildId}/reaction-roles?edit=${panel.messageId}#builder-heading`}
            className="underline"
          >
            Edit
          </Link>
        ) : null}
        <div className="ml-auto flex flex-wrap gap-1">
          <ActionButtonForm
            action={deleteReactionRolePanel.bind(null, guildId)}
            fields={{ messageId: panel.messageId, deleteMessage: 'false' }}
            label="Remove all roles"
            confirmMessage="Remove every role from this message? Its buttons, menu and Ririko’s reactions are taken off."
          />
          {panel.editable ? (
            <ActionButtonForm
              action={deleteReactionRolePanel.bind(null, guildId)}
              fields={{ messageId: panel.messageId, deleteMessage: 'true' }}
              label="Delete message"
              confirmMessage="Delete this message from Discord and remove its roles?"
            />
          ) : null}
        </div>
      </div>
      <ul className="flex flex-col gap-1">
        {panel.bindings.map((binding) => (
          <li key={binding.id} className="flex flex-wrap items-center gap-2 text-sm text-zinc-300">
            <span className="rounded-full border border-edge px-2 py-0.5 text-xs text-zinc-400">
              {TYPE_LABELS[binding.type] ?? binding.type}
            </span>
            {binding.emoji ? <span>{binding.emoji}</span> : null}
            {binding.label ? <span>{binding.label}</span> : null}
            <span className="text-zinc-400">
              gives{' '}
              {binding.roleName ? `@${binding.roleName}` : `a deleted role (${binding.roleId})`}
            </span>
            <ActionButtonForm
              action={removeReactionRoleBinding.bind(null, guildId)}
              fields={{ bindingId: binding.id }}
              label="Remove"
            />
          </li>
        ))}
      </ul>
    </li>
  );
}
