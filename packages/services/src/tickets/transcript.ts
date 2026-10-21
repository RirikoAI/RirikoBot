import type { TextBasedChannel } from 'discord.js';
import type { TranscriptHeader, TranscriptMessage } from './types.js';

/** Messages asked of Discord per request (its maximum). */
export const TRANSCRIPT_PAGE_SIZE = 100;
/** Most messages a transcript holds. A longer ticket keeps the newest and notes the cut-off. */
export const TRANSCRIPT_MAX_MESSAGES = 5000;

/** A ticket number as shown in names: 42 becomes `0042`. */
export function formatTicketNumber(number: number): string {
  return String(number).padStart(4, '0');
}

/** The ticket channel's name, `ticket-0042`. */
export function ticketChannelName(number: number): string {
  return `ticket-${formatTicketNumber(number)}`;
}

/** The transcript file's name, `ticket-0042.txt`. */
export function transcriptFileName(number: number): string {
  return `${ticketChannelName(number)}.txt`;
}

/** `2026-10-21 16:24:49 UTC` */
export function formatUtc(date: Date): string {
  return `${date.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function formatMessage(message: TranscriptMessage): string[] {
  const lines = [`[${formatUtc(message.createdAt)}] ${message.authorTag} (${message.authorId})`];
  if (message.content.length > 0) {
    for (const line of message.content.split(/\r?\n/)) lines.push(`  ${line}`);
  }
  for (const url of message.attachmentUrls) lines.push(`  [attachment] ${url}`);
  for (const title of message.embedTitles) lines.push(`  [embed] ${title}`);
  return lines;
}

/**
 * Builds the transcript text: a header, then every message oldest first. `messages` must already
 * be in that order. The text lives only in the file that is posted; it is never stored or logged.
 */
export function formatTranscript(
  header: TranscriptHeader,
  messages: readonly TranscriptMessage[],
  truncated: boolean,
): string {
  const rule = '='.repeat(60);
  const lines = [
    rule,
    `Server:      ${oneLine(header.guildName)} (${header.guildId})`,
    `Ticket:      #${formatTicketNumber(header.number)}`,
    `Subject:     ${header.subject ? oneLine(header.subject) : 'none'}`,
    `Opened by:   ${oneLine(header.opener)}`,
    `Claimed by:  ${header.claimedBy ? oneLine(header.claimedBy) : 'nobody'}`,
    `Closed by:   ${oneLine(header.closedBy)}`,
    `Reason:      ${header.reason ? oneLine(header.reason) : 'none'}`,
    `Opened at:   ${formatUtc(header.openedAt)}`,
    `Closed at:   ${formatUtc(header.closedAt)}`,
    `Messages:    ${messages.length}`,
    rule,
  ];
  if (truncated) {
    lines.push(
      `Note: this ticket has more than ${TRANSCRIPT_MAX_MESSAGES} messages. Only the newest ${TRANSCRIPT_MAX_MESSAGES} are included.`,
    );
  }
  lines.push('');
  for (const message of messages) lines.push(...formatMessage(message));
  return `${lines.join('\n')}\n`;
}

export interface FetchedTranscript {
  /** Oldest first. */
  messages: TranscriptMessage[];
  /** True when the ticket has older messages than the cap lets in. */
  truncated: boolean;
}

/**
 * Reads a channel's history 100 messages at a time, newest first, until it is empty or
 * `TRANSCRIPT_MAX_MESSAGES` are held, and returns it oldest first.
 */
export async function fetchTranscriptMessages(
  channel: TextBasedChannel,
  maxMessages: number = TRANSCRIPT_MAX_MESSAGES,
): Promise<FetchedTranscript> {
  const newestFirst: TranscriptMessage[] = [];
  let before: string | undefined;

  while (newestFirst.length < maxMessages) {
    const limit = Math.min(TRANSCRIPT_PAGE_SIZE, maxMessages - newestFirst.length);
    const page = await channel.messages.fetch(before === undefined ? { limit } : { limit, before });
    if (page.size === 0) break;
    let lastId: string | undefined;
    for (const message of page.values()) {
      newestFirst.push({
        createdAt: new Date(message.createdTimestamp),
        authorTag: message.author?.tag ?? 'unknown',
        authorId: message.author?.id ?? 'unknown',
        content: message.content ?? '',
        attachmentUrls: Array.from(message.attachments.values(), (a) => a.url),
        embedTitles: message.embeds.flatMap((e) => (e.title ? [e.title] : [])),
      });
      lastId = message.id;
    }
    before = lastId;
    if (page.size < limit) break;
  }

  let truncated = false;
  if (newestFirst.length >= maxMessages && before !== undefined) {
    const more = await channel.messages.fetch({ limit: 1, before });
    truncated = more.size > 0;
  }

  return { messages: newestFirst.reverse(), truncated };
}
