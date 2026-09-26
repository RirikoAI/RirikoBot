import { describe, expect, it, vi } from 'vitest';
import { ChannelType } from 'discord-api-types/v10';
import { GuildResourceDirectory } from './guild-resources';

const GUILD = '100000000000000001';

function channel(id: string, name: string, type: ChannelType, position: number, parent?: string) {
  return { id, name, type, position, parent_id: parent ?? null, guild_id: GUILD };
}

function role(id: string, name: string, position: number, managed = false, permissions = '0') {
  return { id, name, position, managed, color: 0, permissions };
}

const BOT_ID = '900000000000000001';

/** A REST `get` that answers by route, like Discord would. */
function routes(answers: Record<string, unknown>) {
  return vi.fn(async (route: string) => {
    if (!(route in answers)) throw new Error(`Unexpected route ${route}`);
    return answers[route];
  });
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

  it('lists assignable roles below the bot, without @everyone or managed roles', async () => {
    const get = routes({
      [`/guilds/${GUILD}/roles`]: [
        role(GUILD, '@everyone', 0),
        role('r-admin', 'Admin', 12),
        role('r-mod', 'Moderator', 5),
        role('r-bot', 'Ririko', 9, true),
        role('r-booster', 'Server Booster', 3, true),
        role('r-member', 'Member', 2),
      ],
      '/users/@me': { id: BOT_ID },
      [`/guilds/${GUILD}/members/${BOT_ID}`]: { roles: ['r-bot'] },
    });
    const directory = new GuildResourceDirectory({ get }, () => 0);

    expect((await directory.assignableRoles(GUILD)).map((r) => r.name)).toEqual([
      'Moderator',
      'Member',
    ]);
    expect((await directory.memberRoles(GUILD)).map((r) => r.name)).toEqual([
      'Admin',
      'Ririko',
      'Moderator',
      'Server Booster',
      'Member',
    ]);
    await directory.assignableRoles(GUILD);
    expect(get).toHaveBeenCalledTimes(3);
  });

  it('reports the bot top role and whether any of its roles grants Manage Roles', async () => {
    const manageRoles = String(1 << 28);
    const get = routes({
      [`/guilds/${GUILD}/roles`]: [
        role(GUILD, '@everyone', 0),
        role('r-bot', 'Ririko', 4, true),
        role('r-helper', 'Helper', 6, false, manageRoles),
      ],
      '/users/@me': { id: BOT_ID },
      [`/guilds/${GUILD}/members/${BOT_ID}`]: { roles: ['r-bot'] },
    });
    const directory = new GuildResourceDirectory({ get }, () => 0);
    expect(await directory.botRoleContext(GUILD)).toEqual({
      topRoleName: 'Ririko',
      canManageRoles: false,
    });

    const withHelper = routes({
      [`/guilds/${GUILD}/roles`]: [
        role(GUILD, '@everyone', 0),
        role('r-bot', 'Ririko', 4, true),
        role('r-helper', 'Helper', 6, false, manageRoles),
      ],
      '/users/@me': { id: BOT_ID },
      [`/guilds/${GUILD}/members/${BOT_ID}`]: { roles: ['r-bot', 'r-helper'] },
    });
    expect(await new GuildResourceDirectory({ get: withHelper }).botRoleContext(GUILD)).toEqual({
      topRoleName: 'Helper',
      canManageRoles: true,
    });
  });

  it('gives nothing when the bot only has @everyone, and retries a failed bot lookup', async () => {
    let failMe = true;
    const get = vi.fn(async (route: string) => {
      if (route === '/users/@me') {
        if (failMe) {
          failMe = false;
          throw new Error('Discord is down');
        }
        return { id: BOT_ID };
      }
      if (route === `/guilds/${GUILD}/roles`)
        return [role(GUILD, '@everyone', 0), role('r', 'R', 1)];
      return { roles: [] };
    });
    const directory = new GuildResourceDirectory({ get }, () => 0);
    await expect(directory.assignableRoles(GUILD)).rejects.toThrow('Discord is down');
    expect(await directory.assignableRoles(GUILD)).toEqual([]);
    expect(await directory.botRoleContext(GUILD)).toEqual({
      topRoleName: null,
      canManageRoles: false,
    });
  });

  it('lists voice channels in sidebar order', async () => {
    const get = vi
      .fn()
      .mockResolvedValue([
        channel('c-cat', 'Voice', ChannelType.GuildCategory, 0),
        channel('c-text', 'general', ChannelType.GuildText, 0),
        channel('c-b', 'Hub B', ChannelType.GuildVoice, 2, 'c-cat'),
        channel('c-a', 'Hub A', ChannelType.GuildVoice, 1, 'c-cat'),
        channel('c-stage', 'Stage', ChannelType.GuildStageVoice, 3, 'c-cat'),
      ]);
    const directory = new GuildResourceDirectory({ get }, () => 0);
    expect(await directory.voiceChannels(GUILD)).toEqual([
      { id: 'c-a', name: 'Hub A', category: 'Voice' },
      { id: 'c-b', name: 'Hub B', category: 'Voice' },
    ]);
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

  it('caps the voice bitrate by boost tier from the same guild read', async () => {
    const get = vi.fn().mockResolvedValue({ id: GUILD, premium_tier: 2, features: [] });
    const directory = new GuildResourceDirectory({ get }, () => 0);
    expect(await directory.maxBitrate(GUILD)).toBe(256_000);
    await directory.memberCounts(GUILD);
    expect(get).toHaveBeenCalledTimes(1);

    const vip = vi
      .fn()
      .mockResolvedValue({ id: GUILD, premium_tier: 0, features: ['VIP_REGIONS'] });
    expect(await new GuildResourceDirectory({ get: vip }).maxBitrate(GUILD)).toBe(384_000);
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
