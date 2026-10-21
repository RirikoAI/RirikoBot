import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TICKET_WELCOME,
  TICKET_CLAIM_BUTTON_ID,
  TICKET_CLOSE_BUTTON_ID,
  TICKET_OPEN_BUTTON_ID,
  buildTicketButtons,
  buildTranscriptEmbed,
  buildWelcomeMessage,
} from '../messages.js';
import { T_NOW, T_OPEN } from './fixtures.js';

describe('ticket messages', () => {
  it('uses the custom ids TASK-1984 routes by', () => {
    expect(TICKET_OPEN_BUTTON_ID).toBe('ticket:open');
    expect(TICKET_CLAIM_BUTTON_ID).toBe('ticket:claim');
    expect(TICKET_CLOSE_BUTTON_ID).toBe('ticket:close');
    const row = buildTicketButtons().toJSON();
    expect(row.components.map((c) => ('custom_id' in c ? c.custom_id : null))).toEqual([
      'ticket:claim',
      'ticket:close',
    ]);
  });

  it('greets the opener and the staff, with the subject and the buttons', () => {
    const message = buildWelcomeMessage({
      number: 7,
      openerId: 'opener',
      subject: 'Cannot log in',
      staffRoleIds: ['r1', 'r2'],
      welcomeMessage: 'Custom hello',
    });
    const embed = message.embeds?.[0] as { toJSON(): Record<string, unknown> };
    const json = embed.toJSON() as {
      title: string;
      description: string;
      fields: { name: string; value: string }[];
    };

    expect(message.content).toBe('<@opener> <@&r1> <@&r2>');
    expect(message.allowedMentions).toEqual({ users: ['opener'], roles: ['r1', 'r2'] });
    expect(json.title).toBe('Ticket #0007');
    expect(json.description).toBe('Custom hello');
    expect(json.fields).toEqual([
      { name: 'Opened by', value: '<@opener>', inline: true },
      { name: 'Subject', value: 'Cannot log in', inline: true },
      { name: 'Staff', value: '<@&r1> <@&r2>' },
    ]);
    expect(message.components).toHaveLength(1);
  });

  it('falls back to the default welcome, no subject text and no staff field', () => {
    for (const welcomeMessage of [null, '   ']) {
      const message = buildWelcomeMessage({
        number: 1,
        openerId: 'opener',
        subject: null,
        staffRoleIds: [],
        welcomeMessage,
      });
      const json = (message.embeds?.[0] as { toJSON(): Record<string, unknown> }).toJSON() as {
        description: string;
        fields: { name: string; value: string }[];
      };
      expect(json.description).toBe(DEFAULT_TICKET_WELCOME);
      expect(json.fields.map((f) => f.name)).toEqual(['Opened by', 'Subject']);
      expect(json.fields[1]?.value).toBe('No subject');
      expect(message.content).toBe('<@opener>');
    }
  });

  it('cuts a very long subject to a field', () => {
    const message = buildWelcomeMessage({
      number: 1,
      openerId: 'opener',
      subject: 'x'.repeat(3000),
      staffRoleIds: [],
      welcomeMessage: null,
    });
    const json = (message.embeds?.[0] as { toJSON(): Record<string, unknown> }).toJSON() as {
      fields: { value: string }[];
    };
    expect(json.fields[1]?.value).toHaveLength(1024);
    expect(json.fields[1]?.value.endsWith('…')).toBe(true);
  });

  it('describes the closed ticket next to its transcript', () => {
    const embed = buildTranscriptEmbed({
      number: 42,
      openerId: 'opener',
      subject: 'Cannot log in',
      claimedBy: 'staff',
      closedBy: 'closer',
      reason: 'Solved',
      openedAt: T_OPEN,
      closedAt: T_NOW,
      messageCount: 12,
      truncated: false,
    });
    expect(embed.title).toBe('Ticket #0042 closed');
    expect(embed.fields).toEqual([
      { name: 'Opened by', value: '<@opener>', inline: true },
      { name: 'Claimed by', value: '<@staff>', inline: true },
      { name: 'Closed by', value: '<@closer>', inline: true },
      { name: 'Subject', value: 'Cannot log in' },
      { name: 'Reason', value: 'Solved' },
      { name: 'Opened', value: '2026-10-21 10:00:00 UTC', inline: true },
      { name: 'Closed', value: '2026-10-21 12:30:15 UTC', inline: true },
      { name: 'Messages', value: '12', inline: true },
    ]);
  });

  it('shows placeholders and the cut-off in the transcript embed', () => {
    const embed = buildTranscriptEmbed({
      number: 1,
      openerId: 'opener',
      subject: null,
      claimedBy: null,
      closedBy: 'closer',
      reason: null,
      openedAt: T_OPEN,
      closedAt: T_NOW,
      messageCount: 5000,
      truncated: true,
    });
    const values = Object.fromEntries((embed.fields ?? []).map((f) => [f.name, f.value]));
    expect(values).toMatchObject({
      'Claimed by': 'Nobody',
      Subject: 'No subject',
      Reason: 'No reason given',
      Messages: '5000 (newest only)',
    });
  });
});
