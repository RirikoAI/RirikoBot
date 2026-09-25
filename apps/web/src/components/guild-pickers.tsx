import 'server-only';
import { getWebServices } from '@/lib/server/services';
import { SelectField } from './settings-form';

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

/** Role picker for a settings form (excludes @everyone and integration-managed roles). */
export async function RoleSelectField({ guildId, defaultValue, ...field }: PickerProps) {
  const { guildResources } = await getWebServices();
  const roles = await guildResources.assignableRoles(guildId);
  return (
    <SelectField
      {...field}
      defaultValue={defaultValue ?? ''}
      options={roles.map((role) => ({ value: role.id, label: `@${role.name}` }))}
    />
  );
}
