import 'server-only';
import { getWebServices } from '@/lib/server/services';
import { ListField, SelectField, type SelectOption } from './settings-form';

interface PickerProps {
  guildId: string;
  name: string;
  label: string;
  description?: string;
  defaultValue: string | null;
  /** Label of the "none" option; omit to make a choice required. */
  emptyLabel?: string;
}

/**
 * Text and announcement channel picker for a settings form. Render only on pages that have
 * already called `requireGuildAccess(guildId)`.
 */
export async function ChannelSelectField({ guildId, defaultValue, ...field }: PickerProps) {
  const { guildResources } = await getWebServices();
  const channels = await guildResources.messageChannels(guildId);
  return (
    <SelectField
      {...field}
      defaultValue={defaultValue ?? ''}
      options={channels.map((channel) => ({
        value: channel.id,
        label: `#${channel.name}`,
        group: channel.category,
      }))}
    />
  );
}

/**
 * Options for roles Ririko can give, plus any saved role it cannot give (any more), labelled
 * as such. Without them a saved role would vanish from the form and be cleared on the next save.
 */
async function assignableRoleOptions(guildId: string, saved: string[]): Promise<SelectOption[]> {
  const { guildResources } = await getWebServices();
  const roles = await guildResources.assignableRoles(guildId);
  const options = roles.map((role) => ({ value: role.id, label: `@${role.name}` }));
  const missing = saved.filter((id) => !roles.some((role) => role.id === id));
  if (missing.length === 0) return options;
  const names = new Map((await guildResources.memberRoles(guildId)).map((r) => [r.id, r.name]));
  return [
    ...missing.map((id) => {
      const name = names.get(id);
      return {
        value: id,
        label: name === undefined ? `Deleted role (${id})` : `@${name} (Ririko cannot give it)`,
      };
    }),
    ...options,
  ];
}

/** Picker for a role Ririko gives members (excludes @everyone, managed roles and roles at or above Ririko's). */
export async function RoleSelectField({ guildId, defaultValue, ...field }: PickerProps) {
  return (
    <SelectField
      {...field}
      defaultValue={defaultValue ?? ''}
      options={await assignableRoleOptions(guildId, defaultValue ? [defaultValue] : [])}
    />
  );
}

interface ListPickerProps {
  guildId: string;
  name: string;
  label: string;
  description?: string;
  defaultValue: string[];
}

/** Multi-channel picker (text and announcement channels) for a settings form. */
export async function ChannelListField({ guildId, ...field }: ListPickerProps) {
  const { guildResources } = await getWebServices();
  const channels = await guildResources.messageChannels(guildId);
  return (
    <ListField
      {...field}
      addLabel="Add a channel…"
      options={channels.map((channel) => ({
        value: channel.id,
        label: `#${channel.name}`,
        group: channel.category,
      }))}
    />
  );
}

/** Multi-role picker for roles Ririko gives members (below its highest role, not managed). */
export async function AssignableRoleListField({ guildId, ...field }: ListPickerProps) {
  return (
    <ListField
      {...field}
      addLabel="Add a role…"
      options={await assignableRoleOptions(guildId, field.defaultValue)}
    />
  );
}

/**
 * Multi-role picker for settings that match members by role (such as exemptions), so it
 * includes integration-managed roles like Server Booster; excludes @everyone.
 */
export async function RoleListField({ guildId, ...field }: ListPickerProps) {
  const { guildResources } = await getWebServices();
  const roles = await guildResources.memberRoles(guildId);
  return (
    <ListField
      {...field}
      addLabel="Add a role…"
      options={roles.map((role) => ({ value: role.id, label: `@${role.name}` }))}
    />
  );
}
