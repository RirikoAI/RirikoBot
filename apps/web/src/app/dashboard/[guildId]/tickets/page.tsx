import type { Metadata } from 'next';
import {
  MAX_TICKET_STAFF_ROLES,
  MAX_TICKET_WELCOME_MESSAGE_LENGTH,
  MAX_TICKETS_PER_USER,
} from '@ririko/core';
import { CategorySelectField, ChannelSelectField, RoleListField } from '@/components/guild-pickers';
import { NumberField, SettingsForm, TextAreaField, ToggleField } from '@/components/settings-form';
import { requireGuildAccess } from '@/lib/server/guilds/require-guild-access';
import { getWebServices } from '@/lib/server/services';
import { saveTicketSettings } from './actions';

export const metadata: Metadata = { title: 'Tickets · Ririko Dashboard' };

export default async function TicketSettingsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);
  const { guildConfig } = await getWebServices();
  const values = await guildConfig.get(guildId, 'tickets');

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">Tickets</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Members open a private support channel with a button. Staff claim it, and a transcript is
          posted when it closes.
        </p>
      </header>
      <div className="max-w-2xl rounded-md border border-edge p-4 text-sm text-zinc-300">
        <p>
          After saving, post the panel with the Open Ticket button in a channel with{' '}
          <code>/ticket action:panel</code>.
        </p>
      </div>
      <SettingsForm action={saveTicketSettings.bind(null, guildId)}>
        <ToggleField
          name="enabled"
          label="Allow tickets"
          description="When off, the Open Ticket button tells members that tickets are closed. Tickets that are already open keep working."
          defaultValue={values.enabled}
        />
        <CategorySelectField
          guildId={guildId}
          name="categoryId"
          label="Ticket category"
          description="New ticket channels are created under this category. Ririko needs Manage Channels in it, so it can create channels and set who can see them."
          defaultValue={values.categoryId}
          emptyLabel="No category"
        />
        <RoleListField
          guildId={guildId}
          name="staffRoleIds"
          label="Staff roles"
          description={`Members with these roles see and handle every ticket. Up to ${MAX_TICKET_STAFF_ROLES} roles.`}
          defaultValue={values.staffRoleIds}
        />
        <ChannelSelectField
          guildId={guildId}
          name="transcriptChannelId"
          label="Transcript channel"
          description="Receives a text transcript of each closed ticket. Ririko needs View Channel, Send Messages, Embed Links and Attach Files there."
          defaultValue={values.transcriptChannelId}
          emptyLabel="Use the log channel"
        />
        <NumberField
          name="maxOpenPerUser"
          label="Open tickets per member"
          description={`How many tickets one member may have open at the same time (1 to ${MAX_TICKETS_PER_USER}).`}
          min={1}
          max={MAX_TICKETS_PER_USER}
          defaultValue={values.maxOpenPerUser}
        />
        <TextAreaField
          name="welcomeMessage"
          label="Welcome message"
          description={`Posted in each new ticket, up to ${MAX_TICKET_WELCOME_MESSAGE_LENGTH} characters. Leave it empty for Ririko’s default welcome.`}
          defaultValue={values.welcomeMessage ?? ''}
          maxLength={MAX_TICKET_WELCOME_MESSAGE_LENGTH}
        />
      </SettingsForm>
    </section>
  );
}
