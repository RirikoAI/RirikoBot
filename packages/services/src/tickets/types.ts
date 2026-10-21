import type { TextChannel } from 'discord.js';
import type { Ticket } from '@ririko/database';

/** A refusal. `message` is written for the person who pressed the button or ran the command. */
export interface TicketFailure {
  ok: false;
  message: string;
}

/** The result of a ticket action: the extra fields on success, or a refusal. */
export type TicketOutcome<T extends object = object> = ({ ok: true } & T) | TicketFailure;

export type TicketOpened = TicketOutcome<{
  ticket: Ticket;
  channel: TextChannel;
  /** False when the channel and the ticket exist but the welcome message could not be posted. */
  welcomePosted: boolean;
}>;

export type TicketClaimed = TicketOutcome<{ ticket: Ticket }>;

export type TicketMemberChanged = TicketOutcome<{ ticket: Ticket }>;

export type TicketClosed = TicketOutcome<{
  ticket: Ticket;
  /** Where the transcript went, or null when the server has neither a transcript nor a log channel. */
  transcriptChannelId: string | null;
  /** False when the ticket is closed but Discord refused to delete the channel. */
  channelDeleted: boolean;
}>;

/** One message of a transcript, reduced to what the file shows. */
export interface TranscriptMessage {
  createdAt: Date;
  authorTag: string;
  authorId: string;
  content: string;
  attachmentUrls: string[];
  embedTitles: string[];
}

/** The facts the transcript header states. Strings are already resolved to readable names. */
export interface TranscriptHeader {
  guildName: string;
  guildId: string;
  number: number;
  subject: string | null;
  opener: string;
  claimedBy: string | null;
  closedBy: string;
  reason: string | null;
  openedAt: Date;
  closedAt: Date;
}
