import { describe, it, expect } from 'vitest';
import type { GiveawayRepository } from '@ririko/database';
import { GiveawayEngine } from '../engine.js';
import { buildEndedMessages, buildRerollAnnouncement, giveawayMessageUrl } from '../messages.js';
import type { Giveaway } from '../types.js';

const giveaway: Giveaway = {
  id: 'gw-1',
  guildId: 'guild-1',
  channelId: 'chan-1',
  messageId: 'msg-1',
  prize: 'Nitro',
  winnerCount: 2,
  startsAt: new Date('2026-09-01T00:00:00Z'),
  endsAt: new Date('2026-09-02T00:00:00Z'),
  isEnded: false,
  requirements: {},
  createdBy: 'host-1',
};
const engine = new GiveawayEngine({} as GiveawayRepository);

describe('giveaway messages (TASK-1153)', () => {
  it('builds the ended embed with a disabled button and pings only the winners', () => {
    const messages = buildEndedMessages(engine, giveaway, 7, ['u1', 'u2']);
    expect(messages.edit.embeds[0]).toMatchObject({
      title: '🎉 GIVEAWAY ENDED: Nitro',
      timestamp: '2026-09-02T00:00:00.000Z',
    });
    expect(messages.edit.components[0]!.components[0]).toMatchObject({
      custom_id: 'giveaway:enter:gw-1',
      disabled: true,
      label: 'Giveaway Ended',
    });
    expect(messages.announcement).toEqual({
      content:
        '🎉 Congratulations <@u1>, <@u2>! You won **Nitro**!\nhttps://discord.com/channels/guild-1/chan-1/msg-1',
      mentionUserIds: ['u1', 'u2'],
    });
  });

  it('says when nobody won and pings no one', () => {
    const { announcement } = buildEndedMessages(engine, giveaway, 0, []);
    expect(announcement).toEqual({
      content: '⚠️ Giveaway for **Nitro** has ended with no eligible winners.',
      mentionUserIds: [],
    });
  });

  it('announces rerolls, and leaves the link out before the message exists', () => {
    const unsent = { ...giveaway, messageId: '' };
    expect(giveawayMessageUrl(unsent)).toBeNull();
    expect(buildRerollAnnouncement(unsent, ['u3'])).toEqual({
      content: '🎉 **Giveaway Rerolled!**\nNew Winner(s): <@u3>!\nYou won **Nitro**!',
      mentionUserIds: ['u3'],
    });
  });
});
