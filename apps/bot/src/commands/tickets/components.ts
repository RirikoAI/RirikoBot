import {
  ActionRowBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type GuildMember,
  type ModalSubmitInteraction,
  type TextChannel,
  MessageFlags,
} from 'discord.js';
import { describeErrorForLog } from '@ririko/core';
import {
  TICKET_CLAIM_BUTTON_ID,
  TICKET_CLOSE_BUTTON_ID,
  TICKET_OPEN_BUTTON_ID,
  TICKET_REASON_MAX_LENGTH,
  TICKET_SUBJECT_MAX_LENGTH,
  type TicketClosed,
} from '@ririko/services';
import type { BotServices } from '../../services.js';

/** Custom ids of the two modals. Both start with `ticket:` so the router sends them here. */
export const TICKET_OPEN_MODAL_ID = 'ticket:modal:open';
export const TICKET_CLOSE_MODAL_ID = 'ticket:modal:close';

const SUBJECT_FIELD_ID = 'subject';
const REASON_FIELD_ID = 'reason';
const NOT_A_TICKET = 'This channel is not an open ticket.';

/** True for the ids of the ticket buttons and modals. */
export function isTicketCustomId(customId: string): boolean {
  return customId.startsWith('ticket:');
}

/** The modal behind the panel's Open Ticket button: one required Subject field. */
export function buildOpenTicketModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(TICKET_OPEN_MODAL_ID)
    .setTitle('Open a ticket')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(SUBJECT_FIELD_ID)
          .setLabel('Subject')
          .setPlaceholder('What do you need help with?')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(TICKET_SUBJECT_MAX_LENGTH),
      ),
    );
}

/** The modal behind a ticket's Close button: one optional Reason field. */
export function buildCloseTicketModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(TICKET_CLOSE_MODAL_ID)
    .setTitle('Close this ticket')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(REASON_FIELD_ID)
          .setLabel('Reason (optional)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(TICKET_REASON_MAX_LENGTH),
      ),
    );
}

/** What to tell the person who closed a ticket. The channel is usually gone by then. */
export function describeClosed(result: Extract<TicketClosed, { ok: true }>): string {
  const number = String(result.ticket.number).padStart(4, '0');
  const parts = [`Ticket #${number} is closed.`];
  if (result.transcriptChannelId) {
    parts.push(`The transcript is in <#${result.transcriptChannelId}>.`);
  } else {
    parts.push('No transcript was saved, because the server has no transcript or log channel.');
  }
  if (!result.channelDeleted) {
    parts.push('Ririko could not delete the channel, so a staff member must remove it.');
  }
  return parts.join(' ');
}

/** The guild member who pressed a button. Interactions from uncached guilds carry a raw member. */
async function resolveMember(
  interaction: ButtonInteraction | ModalSubmitInteraction,
): Promise<GuildMember | null> {
  const member = interaction.member;
  if (member && typeof member.permissions !== 'string') return member as GuildMember;
  return (await interaction.guild?.members.fetch(interaction.user.id).catch(() => null)) ?? null;
}

function ticketChannel(
  interaction: ButtonInteraction | ModalSubmitInteraction,
): TextChannel | null {
  const channel = interaction.channel;
  return channel && channel.type === ChannelType.GuildText ? (channel as TextChannel) : null;
}

/** Edits the deferred reply. Never throws: a closed ticket's channel may be gone already. */
async function finish(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  content: string,
): Promise<void> {
  try {
    await interaction.editReply({ content, allowedMentions: { parse: [] } });
  } catch (error) {
    console.error(`[Tickets] Could not answer an interaction: ${describeErrorForLog(error)}`);
  }
}

/**
 * Ticket buttons. Open and Close show a modal as the first response (a modal cannot follow a
 * deferred reply); Claim claims at once.
 */
export async function handleTicketButton(
  interaction: ButtonInteraction,
  services: BotServices,
): Promise<void> {
  const { customId } = interaction;
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: 'Tickets only work in a server.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (customId === TICKET_OPEN_BUTTON_ID) {
    await interaction.showModal(buildOpenTicketModal());
    return;
  }
  if (customId === TICKET_CLOSE_BUTTON_ID) {
    await interaction.showModal(buildCloseTicketModal());
    return;
  }
  if (customId !== TICKET_CLAIM_BUTTON_ID) return;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const member = await resolveMember(interaction);
  const channel = ticketChannel(interaction);
  if (!member || !channel) {
    await finish(interaction, NOT_A_TICKET);
    return;
  }
  const result = await services.ticketService.claim(member, channel);
  await finish(interaction, result.ok ? 'You claimed this ticket.' : result.message);
}

/** Ticket modal submits: the subject modal opens a ticket, the reason modal closes one. */
export async function handleTicketModal(
  interaction: ModalSubmitInteraction,
  services: BotServices,
): Promise<void> {
  const { customId } = interaction;
  if (customId !== TICKET_OPEN_MODAL_ID && customId !== TICKET_CLOSE_MODAL_ID) return;
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: 'Tickets only work in a server.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Opening creates a channel and closing pages through the history; both can pass 3 seconds.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const member = await resolveMember(interaction);
  if (!member) {
    await finish(interaction, 'Could not find you in this server. Try again in a moment.');
    return;
  }

  if (customId === TICKET_OPEN_MODAL_ID) {
    const subject = interaction.fields.getTextInputValue(SUBJECT_FIELD_ID);
    const result = await services.ticketService.open(member, subject);
    if (!result.ok) {
      await finish(interaction, result.message);
      return;
    }
    const note = result.welcomePosted
      ? ''
      : ' Ririko could not post the welcome message there, but the ticket is open.';
    await finish(interaction, `Your ticket is ready: <#${result.channel.id}>.${note}`);
    return;
  }

  const channel = ticketChannel(interaction);
  if (!channel) {
    await finish(interaction, NOT_A_TICKET);
    return;
  }
  const reason = interaction.fields.getTextInputValue(REASON_FIELD_ID);
  const result = await services.ticketService.close(member, channel, reason);
  await finish(interaction, result.ok ? describeClosed(result) : result.message);
}
