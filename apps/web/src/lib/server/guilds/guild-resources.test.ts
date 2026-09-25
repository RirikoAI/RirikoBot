import { describe, expect, it, vi } from 'vitest';
import { ChannelType } from 'discord-api-types/v10';
import { GuildResourceDirectory } from './guild-resources';

const GUILD = '100000000000000001';

function channel(id: string, name: string, type: ChannelType, position: number, parent?: string) {
  return { id, name, type, position, parent_id: parent ?? null, guild_id: GUILD };
}

function role(id: string, name: string, position: number, managed = false) {
  return { id, name, position, managed, color: 0 };
}

describe('GuildResourceDirectory (TASK-1112)', () => {
  it('lists text and announcement channels in sidebar order with their category', async () => {
    const get = vi
      .fn()
      .mockResolvedValue([
        channel('c-cat-b', 'Community', ChannelType.GuildCategory, 1),
        channel('c-cat-a', 'Info', ChannelType.GuildCategory, 0),
        channel('c-general', 'general', ChannelType.GuildText, 0, 'c-cat-b'),
        channel('c-rules', 'rules', ChannelType.GuildText, 1, 'c-cat-a'),
        channel('c-news', 'news', ChannelType.GuildAnnouncement, 0, 'c-cat-a'),
        channel('c-voice', 'Lounge', ChannelType.GuildVoice, 2, 'c-cat-b'),
        channel('c-top', 'lobby', ChannelType.GuildText, 5),
      ]);
    const directory = new GuildResourceDirectory({ get }, () => 0);

    expect(await directory.messageChannels(GUILD)).toEqual([
      { id: 'c-top', name: 'lobby', category: null },
      { id: 'c-news', name: 'news', category: 'Info' },
      { id: 'c-rules', name: 'rules', category: 'Info' },
      { id: 'c-general', name: 'general', category: 'Community' },
    ]);
    await directory.messageChannels(GUILD);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('lists assignable roles from highest to lowest, without @everyone or managed roles', async () => {
    const get = vi
      .fn()
      .mockResolvedValue([
        role(GUILD, '@everyone', 0),
        role('r-mod', 'Moderator', 5),
        role('r-bot', 'Ririko', 9, true),
        role('r-member', 'Member', 2),
      ]);
    const directory = new GuildResourceDirectory({ get }, () => 0);

    expect((await directory.assignableRoles(GUILD)).map((r) => r.name)).toEqual([
      'Moderator',
      'Member',
    ]);
    expect((await directory.memberRoles(GUILD)).map((r) => r.name)).toEqual([
      'Ririko',
      'Moderator',
      'Member',
    ]);
    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe('GuildResourceDirectory counts and channel names (TASK-1131)', () => {
  it('reads approximate member and online counts once per TTL', async () => {
    const get = vi.fn().mockResolvedValue({
      id: GUILD,
      approximate_member_count: 120,
      approximate_presence_count: 33,
    });
    const directory = new GuildResourceDirectory({ get }, () => 0);

    expect(await directory.memberCounts(GUILD)).toEqual({ members: 120, online: 33 });
    await directory.memberCounts(GUILD);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0]![1].query.get('with_counts')).toBe('true');
  });

  it('maps every channel ID to its name from the shared channel list', async () => {
    const get = vi
      .fn()
      .mockResolvedValue([
        channel('c-voice', 'Lounge', ChannelType.GuildVoice, 0),
        channel('c-general', 'general', ChannelType.GuildText, 1),
      ]);
    const directory = new GuildResourceDirectory({ get }, () => 0);

    const names = await directory.channelNames(GUILD);
    expect(names.get('c-voice')).toBe('Lounge');
    await directory.messageChannels(GUILD);
    expect(get).toHaveBeenCalledTimes(1);
  });
});
