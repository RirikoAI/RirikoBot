import { describe, expect, it, vi } from 'vitest';
import { checkAssignableRoles, checkAutoVoiceHubs } from './setting-checks';

const GUILD = '100000000000000001';
const MEMBER = '200000000000000001';
const ADMIN = '200000000000000002';
const GONE = '200000000000000003';
const HUB = '300000000000000001';
const TEXT = '300000000000000002';

function resources() {
  return {
    assignableRoles: vi.fn().mockResolvedValue([{ id: MEMBER, name: 'Member', color: 0 }]),
    memberRoles: vi.fn().mockResolvedValue([
      { id: ADMIN, name: 'Admin', color: 0 },
      { id: MEMBER, name: 'Member', color: 0 },
    ]),
    voiceChannels: vi.fn().mockResolvedValue([{ id: HUB, name: 'Join', category: null }]),
    maxBitrate: vi.fn().mockResolvedValue(128_000),
  };
}

describe('checkAssignableRoles (TASK-1641)', () => {
  it('names roles Ririko cannot give and roles that no longer exist', async () => {
    expect(
      await checkAssignableRoles(resources(), GUILD, {
        humanRoleIds: [MEMBER, ADMIN],
        botRoleIds: [],
        verificationRoleId: GONE,
      }),
    ).toEqual({
      humanRoleIds: [
        'Ririko cannot give @Admin: it is managed by an integration or is not below Ririko’s highest role.',
      ],
      verificationRoleId: [`Role ${GONE} no longer exists.`],
    });
  });

  it('skips Discord when no role was submitted', async () => {
    const directory = resources();
    expect(
      await checkAssignableRoles(directory, GUILD, { humanRoleIds: [], verificationRoleId: '' }),
    ).toEqual({});
    expect(directory.assignableRoles).not.toHaveBeenCalled();
  });
});

describe('checkAutoVoiceHubs (TASK-1641)', () => {
  it('numbers errors by submitted row', async () => {
    const hubs = JSON.stringify([
      { channelId: HUB, bitrate: 256_000 },
      { channelId: TEXT, bitrate: 64_000 },
    ]);
    expect(await checkAutoVoiceHubs(resources(), GUILD, hubs)).toEqual({
      hubs: [
        'Row 1: This server allows up to 128 kbps at its boost level.',
        'Row 2: Choose a voice channel of this server.',
      ],
    });
  });

  it('leaves malformed rows to the schema and passes valid hubs', async () => {
    const directory = resources();
    expect(await checkAutoVoiceHubs(directory, GUILD, '{nope')).toEqual({});
    expect(
      await checkAutoVoiceHubs(directory, GUILD, [{ channelId: HUB, userLimit: 500 }]),
    ).toEqual({});
    expect(directory.voiceChannels).not.toHaveBeenCalled();
    expect(await checkAutoVoiceHubs(directory, GUILD, [{ channelId: HUB }])).toEqual({});
  });
});
