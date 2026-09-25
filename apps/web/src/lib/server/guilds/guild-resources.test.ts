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
