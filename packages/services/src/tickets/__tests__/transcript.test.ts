import { describe, expect, it, vi } from 'vitest';
import type { TextBasedChannel } from 'discord.js';
import {
  TRANSCRIPT_MAX_MESSAGES,
  fetchTranscriptMessages,
  formatTicketNumber,
  formatTranscript,
  formatUtc,
  ticketChannelName,
  transcriptFileName,
} from '../transcript.js';
import type { TranscriptHeader, TranscriptMessage } from '../types.js';
import { T_NOW, T_OPEN, makeMessage } from './fixtures.js';

const HEADER: TranscriptHeader = {
  guildName: 'Test Guild',
  guildId: 'g1',
  number: 42,
  subject: 'Cannot log in',
  opener: 'opener#0 (opener)',
  claimedBy: 'staff#0 (staff)',
  closedBy: 'closer#0 (closer)',
  reason: 'Solved',
  openedAt: T_OPEN,
  closedAt: T_NOW,
};

function message(overrides: Partial<TranscriptMessage> = {}): TranscriptMessage {
  return {
    createdAt: new Date('2026-10-21T10:05:07.000Z'),
    authorTag: 'alice#0',
    authorId: '111',
    content: 'Hello',
    attachmentUrls: [],
    embedTitles: [],
    ...overrides,
  };
}

/** A channel whose history is `total` messages, newest first, served like Discord does. */
function historyChannel(total: number) {
  const all = Array.from({ length: total }, (_, i) => makeMessage(total - 1 - i));
  const fetch = vi.fn(async (options: { limit: number; before?: string }) => {
    const start = options.before ? all.findIndex((m) => m.id === options.before) + 1 : 0;
    return new Map(all.slice(start, start + options.limit).map((m) => [m.id, m]));
  });
  return { channel: { messages: { fetch } } as unknown as TextBasedChannel, fetch };
}

describe('ticket names', () => {
  it('pads the number to four digits', () => {
    expect(formatTicketNumber(7)).toBe('0007');
    expect(formatTicketNumber(12345)).toBe('12345');
    expect(ticketChannelName(42)).toBe('ticket-0042');
    expect(transcriptFileName(42)).toBe('ticket-0042.txt');
  });

  it('writes times in UTC', () => {
    expect(formatUtc(T_NOW)).toBe('2026-10-21 12:30:15 UTC');
  });
});

describe('formatTranscript', () => {
  it('writes the header, then the messages in the order given', () => {
    const text = formatTranscript(
      HEADER,
      [message(), message({ authorTag: 'bob#0', authorId: '222', content: 'Hi' })],
      false,
    );
    const lines = text.split('\n');

    expect(text.endsWith('\n')).toBe(true);
    expect(text).toContain('Server:      Test Guild (g1)');
    expect(text).toContain('Ticket:      #0042');
    expect(text).toContain('Subject:     Cannot log in');
    expect(text).toContain('Opened by:   opener#0 (opener)');
    expect(text).toContain('Claimed by:  staff#0 (staff)');
    expect(text).toContain('Closed by:   closer#0 (closer)');
    expect(text).toContain('Reason:      Solved');
    expect(text).toContain('Opened at:   2026-10-21 10:00:00 UTC');
    expect(text).toContain('Closed at:   2026-10-21 12:30:15 UTC');
    expect(text).toContain('Messages:    2');
    expect(text).not.toContain('Note:');
    expect(lines.indexOf('[2026-10-21 10:05:07 UTC] alice#0 (111)')).toBeGreaterThan(0);
    expect(text.indexOf('alice#0 (111)')).toBeLessThan(text.indexOf('bob#0 (222)'));
    expect(lines).toContain('  Hello');
  });

  it('shows placeholders for a missing subject, claimer and reason', () => {
    const text = formatTranscript(
      { ...HEADER, subject: null, claimedBy: null, reason: null },
      [],
      false,
    );
    expect(text).toContain('Subject:     none');
    expect(text).toContain('Claimed by:  nobody');
    expect(text).toContain('Reason:      none');
    expect(text).toContain('Messages:    0');
  });

  it('keeps header values on one line', () => {
    const text = formatTranscript({ ...HEADER, reason: 'two\nlines   here' }, [], false);
    expect(text).toContain('Reason:      two lines here');
  });

  it('indents every line of a message and lists attachment URLs and embed titles', () => {
    const text = formatTranscript(
      HEADER,
      [
        message({
          content: 'line one\r\nline two',
          attachmentUrls: ['https://cdn.example/a.png', 'https://cdn.example/b.pdf'],
          embedTitles: ['A title'],
        }),
        message({ content: '' }),
      ],
      false,
    );
    expect(text).toContain('  line one\n  line two\n');
    expect(text).toContain('  [attachment] https://cdn.example/a.png\n');
    expect(text).toContain('  [attachment] https://cdn.example/b.pdf\n');
    expect(text).toContain('  [embed] A title\n');
  });

  it('notes the cut-off when the ticket was longer than the cap', () => {
    const text = formatTranscript(HEADER, [message()], true);
    expect(text).toContain(
      `Note: this ticket has more than ${TRANSCRIPT_MAX_MESSAGES} messages. Only the newest ${TRANSCRIPT_MAX_MESSAGES} are included.`,
    );
  });
});

describe('fetchTranscriptMessages', () => {
  it('returns an empty history for an empty channel', async () => {
    const { channel, fetch } = historyChannel(0);
    expect(await fetchTranscriptMessages(channel)).toEqual({ messages: [], truncated: false });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith({ limit: 100 });
  });

  it('pages 100 at a time and returns the messages oldest first', async () => {
    const { channel, fetch } = historyChannel(250);
    const { messages, truncated } = await fetchTranscriptMessages(channel);

    expect(truncated).toBe(false);
    expect(messages).toHaveLength(250);
    expect(messages[0]?.content).toBe('message 0');
    expect(messages[249]?.content).toBe('message 249');
    expect(fetch.mock.calls.map(([options]) => options.limit)).toEqual([100, 100, 100]);
    expect(fetch.mock.calls[0]?.[0]).toEqual({ limit: 100 });
    expect(fetch.mock.calls[1]?.[0]).toEqual({ limit: 100, before: '1150' });
    expect(fetch.mock.calls[2]?.[0]).toEqual({ limit: 100, before: '1050' });
  });

  it('maps author, time, content, attachments and embed titles', async () => {
    const withExtras = makeMessage(0, {
      attachments: new Map([['a', { url: 'https://cdn.example/file.png' }]]),
      embeds: [{ title: 'Embedded' }, { title: null }],
    });
    const noAuthor = makeMessage(1, { author: null, content: undefined });
    const fetch = vi.fn().mockResolvedValueOnce(
      new Map([
        [noAuthor.id, noAuthor],
        [withExtras.id, withExtras],
      ]),
    );
    const channel = { messages: { fetch } } as unknown as TextBasedChannel;

    const { messages } = await fetchTranscriptMessages(channel);

    expect(messages[0]).toEqual({
      createdAt: new Date(T_OPEN.getTime()),
      authorTag: 'user0#0',
      authorId: 'u0',
      content: 'message 0',
      attachmentUrls: ['https://cdn.example/file.png'],
      embedTitles: ['Embedded'],
    });
    expect(messages[1]).toMatchObject({ authorTag: 'unknown', authorId: 'unknown', content: '' });
  });

  it('stops at the cap, keeps the newest messages and says the ticket was cut off', async () => {
    const { channel, fetch } = historyChannel(TRANSCRIPT_MAX_MESSAGES + 30);
    const { messages, truncated } = await fetchTranscriptMessages(channel);

    expect(truncated).toBe(true);
    expect(messages).toHaveLength(TRANSCRIPT_MAX_MESSAGES);
    expect(messages[TRANSCRIPT_MAX_MESSAGES - 1]?.content).toBe(
      `message ${TRANSCRIPT_MAX_MESSAGES + 29}`,
    );
    expect(messages[0]?.content).toBe('message 30');
    // 50 pages of 100, then one probe for anything older.
    expect(fetch).toHaveBeenCalledTimes(51);
    expect(fetch.mock.calls[50]?.[0]).toMatchObject({ limit: 1 });
  });

  it('does not call a ticket of exactly the cap cut off', async () => {
    const { channel } = historyChannel(TRANSCRIPT_MAX_MESSAGES);
    const { messages, truncated } = await fetchTranscriptMessages(channel);
    expect(messages).toHaveLength(TRANSCRIPT_MAX_MESSAGES);
    expect(truncated).toBe(false);
  });

  it('asks only for what the cap still allows', async () => {
    const { channel, fetch } = historyChannel(500);
    await fetchTranscriptMessages(channel, 150);
    expect(fetch.mock.calls.map(([options]) => options.limit)).toEqual([100, 50, 1]);
  });
});
