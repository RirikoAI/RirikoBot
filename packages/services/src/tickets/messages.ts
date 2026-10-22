import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type APIEmbed,
  type MessageCreateOptions,
} from 'discord.js';
import { formatTicketNumber, formatUtc } from './transcript.js';

/** Custom ids of the ticket buttons. TASK-1984 routes interactions by these. */
export const TICKET_OPEN_BUTTON_ID = 'ticket:open';
export const TICKET_CLAIM_BUTTON_ID = 'ticket:claim';
export const TICKET_CLOSE_BUTTON_ID = 'ticket:close';

/** Posted when the server has not written its own welcome message. */
export const DEFAULT_TICKET_WELCOME =
  'Thanks for opening a ticket. Please describe what you need and a member of the staff will help you soon.';

const EMBED_COLOR = 0x5865f2;
const CLOSED_COLOR = 0xed4245;
const FIELD_LIMIT = 1024;

/** Cuts text to a field's limit, ending with an ellipsis. */
function clip(text: string, max: number = FIELD_LIMIT): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function buildTicketButtons(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(TICKET_CLAIM_BUTTON_ID)
      .setLabel('Claim')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(TICKET_CLOSE_BUTTON_ID)
      .setLabel('Close')
      .setStyle(ButtonStyle.Danger),
  );
}

export interface WelcomeInput {
  number: number;
  openerId: string;
  subject: string | null;
  staffRoleIds: readonly string[];
  /** The server's welcome message, or null for the built-in default. */
  welcomeMessage: string | null;
}

/** The first message of a ticket: opener and staff pinged, an embed, and the two buttons. */
export function buildWelcomeMessage(input: WelcomeInput): MessageCreateOptions {
  const staffMentions = input.staffRoleIds.map((id) => `<@&${id}>`);
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(`Ticket #${formatTicketNumber(input.number)}`)
    .setDescription(input.welcomeMessage?.trim() || DEFAULT_TICKET_WELCOME)
    .addFields(
      { name: 'Opened by', value: `<@${input.openerId}>`, inline: true },
      { name: 'Subject', value: clip(input.subject ?? 'No subject'), inline: true },
    );
  if (staffMentions.length > 0) {
    embed.addFields({ name: 'Staff', value: clip(staffMentions.join(' ')) });
  }
  return {
    content: [`<@${input.openerId}>`, ...staffMentions].join(' '),
    embeds: [embed],
    components: [buildTicketButtons()],
    allowedMentions: { users: [input.openerId], roles: [...input.staffRoleIds] },
  };
}

export interface TranscriptEmbedInput {
  number: number;
  openerId: string;
  subject: string | null;
  claimedBy: string | null;
  closedBy: string;
  reason: string | null;
  openedAt: Date;
  closedAt: Date;
  messageCount: number;
  truncated: boolean;
}

/** The embed that goes with the transcript file. */
export function buildTranscriptEmbed(input: TranscriptEmbedInput): APIEmbed {
  const embed = new EmbedBuilder()
    .setColor(CLOSED_COLOR)
    .setTitle(`Ticket #${formatTicketNumber(input.number)} closed`)
    .addFields(
      { name: 'Opened by', value: `<@${input.openerId}>`, inline: true },
      {
        name: 'Claimed by',
        value: input.claimedBy ? `<@${input.claimedBy}>` : 'Nobody',
        inline: true,
      },
      { name: 'Closed by', value: `<@${input.closedBy}>`, inline: true },
      { name: 'Subject', value: clip(input.subject ?? 'No subject') },
      { name: 'Reason', value: clip(input.reason ?? 'No reason given') },
      { name: 'Opened', value: formatUtc(input.openedAt), inline: true },
      { name: 'Closed', value: formatUtc(input.closedAt), inline: true },
      {
        name: 'Messages',
        value: input.truncated ? `${input.messageCount} (newest only)` : `${input.messageCount}`,
        inline: true,
      },
    );
  return embed.toJSON();
}
