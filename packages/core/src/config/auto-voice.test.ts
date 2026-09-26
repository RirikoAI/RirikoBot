import { describe, expect, it } from 'vitest';
import { AutoVoiceHubsSchema, voiceBitrateCap } from './auto-voice.js';

const A = '100000000000000001';
const B = '100000000000000002';

describe('voiceBitrateCap', () => {
  it('follows the boost tier, and VIP regions always get 384 kbps', () => {
    expect([0, 1, 2, 3].map((tier) => voiceBitrateCap(tier))).toEqual([
      96_000, 128_000, 256_000, 384_000,
    ]);
    expect(voiceBitrateCap(0, true)).toBe(384_000);
  });
});

describe('AutoVoiceHubsSchema', () => {
  it('fills defaults and sorts hubs by channel so equal lists compare equal', () => {
    expect(
      AutoVoiceHubsSchema.parse([
        { channelId: B, nameTemplate: '  Room of {user} ', userLimit: 5, bitrate: 96_000 },
        { channelId: A },
      ]),
    ).toEqual([
      { channelId: A, nameTemplate: "{user}'s Room", userLimit: 0, bitrate: 64_000 },
      { channelId: B, nameTemplate: 'Room of {user}', userLimit: 5, bitrate: 96_000 },
    ]);
  });

  it('reports the row of a bad field and duplicate channels', () => {
    const result = AutoVoiceHubsSchema.safeParse([
      { channelId: A, userLimit: 100 },
      { channelId: B, bitrate: 500_000 },
      { channelId: A, nameTemplate: ' ' },
    ]);
    expect(result.success).toBe(false);
    const issues = result.error!.issues.map((issue) => [issue.path.join('.'), issue.message]);
    expect(issues).toEqual([
      ['0.userLimit', 'User limit must be a whole number from 0 to 99.'],
      ['1.bitrate', 'Bitrate must be from 8 to 384 kbps.'],
      ['2.nameTemplate', 'Enter a channel name.'],
      ['2.channelId', 'This channel is already a hub.'],
    ]);
    const duplicate = AutoVoiceHubsSchema.safeParse([{ channelId: A }, { channelId: A }]);
    expect(duplicate.error!.issues[0]).toMatchObject({
      path: [1, 'channelId'],
      message: 'This channel is already a hub.',
    });
  });

  it('rejects unknown fields and more than 20 hubs', () => {
    expect(AutoVoiceHubsSchema.safeParse([{ channelId: A, owner: 'x' }]).success).toBe(false);
    const many = Array.from({ length: 21 }, (_, i) => ({ channelId: `1000000000000000${10 + i}` }));
    expect(AutoVoiceHubsSchema.safeParse(many).success).toBe(false);
  });
});
