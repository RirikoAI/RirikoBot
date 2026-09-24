import { describe, expect, it, vi } from 'vitest';
import type { RESTAPIPartialCurrentUserGuild } from 'discord-api-types/v10';
import { DiscordApiError } from '../auth/discord-oauth';
import type { ActiveSession } from '../auth/session-service';
import { TtlCache } from '../ttl-cache';
import { BotGuildDirectory } from './bot-guilds';
import { GuildAccessService, USER_GUILDS_TTL_MS } from './guild-access';
import { BOT_INVITE_PERMISSIONS, botInviteUrl, canManageGuild } from './permissions';

const MANAGE_GUILD = (1n << 5n).toString();
const ADMINISTRATOR = (1n << 3n).toString();
const SEND_MESSAGES = (1n << 11n).toString();

function guild(
  id: string,
  name: string,
  permissions: string,
  owner = false,
): RESTAPIPartialCurrentUserGuild {
  return { id, name, icon: null, banner: null, owner, permissions, features: [] };
}

const session: ActiveSession = {
  id: 'session-hash',
  userId: 'user-1',
  createdAt: new Date(0),
  expiresAt: new Date(0),
  stepUpAt: null,
};

describe('canManageGuild', () => {
  it('accepts Manage Server, Administrator and guild owners', () => {
    expect(canManageGuild(guild('1', 'a', MANAGE_GUILD))).toBe(true);
    expect(canManageGuild(guild('1', 'a', ADMINISTRATOR))).toBe(true);
    expect(canManageGuild(guild('1', 'a', '0', true))).toBe(true);
    // Bits above 2^53 must not break the check.
    expect(canManageGuild(guild('1', 'a', ((1n << 50n) | (1n << 5n)).toString()))).toBe(true);
  });

  it('rejects other permissions and malformed bitfields', () => {
    expect(canManageGuild(guild('1', 'a', SEND_MESSAGES))).toBe(false);
    expect(canManageGuild(guild('1', 'a', '0'))).toBe(false);
    expect(canManageGuild(guild('1', 'a', 'not-a-number'))).toBe(false);
  });
});

describe('botInviteUrl', () => {
  it('invites the bot to one guild with the legacy permission set', () => {
    const url = new URL(botInviteUrl('client-1', 'guild-9'));
    expect(url.searchParams.get('client_id')).toBe('client-1');
    expect(url.searchParams.get('guild_id')).toBe('guild-9');
    expect(url.searchParams.get('disable_guild_select')).toBe('true');
    expect(url.searchParams.get('scope')).toBe('bot applications.commands');
    expect(BigInt(url.searchParams.get('permissions')!)).toBe(BOT_INVITE_PERMISSIONS);
    expect(BOT_INVITE_PERMISSIONS & (1n << 3n)).toBe(0n);
  });
});

describe('GuildAccessService (TASK-1103)', () => {
  function setup(userGuilds: RESTAPIPartialCurrentUserGuild[], botGuilds: string[]) {
    let now = 0;
    const state = { userGuilds, botGuilds: new Set(botGuilds), token: 'access' as string | null };
    const getCurrentUserGuilds = vi.fn(async () => state.userGuilds);
    const getDiscordAccessToken = vi.fn(async () => state.token);
    const end = vi.fn(async () => {});
    const service = new GuildAccessService({
      sessions: { getDiscordAccessToken, end },
      oauth: { getCurrentUserGuilds },
      botGuildIds: async () => state.botGuilds,
      now: () => now,
    });
    return { service, state, getCurrentUserGuilds, end, advance: (ms: number) => (now += ms) };
  }

  it('keeps manageable guilds, flags bot membership and lists bot guilds first', async () => {
    const { service } = setup(
      [
        guild('1', 'Zeta', MANAGE_GUILD),
        guild('2', 'Alpha', ADMINISTRATOR),
        guild('3', 'Member only', SEND_MESSAGES),
        guild('4', 'Beta', '0', true),
      ],
      ['1', '3'],
    );

    expect(await service.listManageableGuilds(session)).toEqual([
      { id: '1', name: 'Zeta', icon: null, botPresent: true },
      { id: '2', name: 'Alpha', icon: null, botPresent: false },
      { id: '4', name: 'Beta', icon: null, botPresent: false },
    ]);
  });

  it('grants access only to managed guilds that have the bot', async () => {
    const { service } = setup(
      [guild('1', 'Managed', MANAGE_GUILD), guild('2', 'No bot', MANAGE_GUILD)],
      ['1', '3'],
    );

    expect(await service.checkAccess(session, '1')).toMatchObject({ id: '1', botPresent: true });
    expect(await service.checkAccess(session, '2')).toBe('denied');
    // The bot is in guild 3 but the user does not manage it.
    expect(await service.checkAccess(session, '3')).toBe('denied');
  });

  it('rejects a user whose Manage Server permission was revoked once the cache expires', async () => {
    const { service, state, advance } = setup([guild('1', 'Managed', MANAGE_GUILD)], ['1']);
    expect(await service.checkAccess(session, '1')).not.toBe('denied');

    state.userGuilds = [guild('1', 'Managed', SEND_MESSAGES)];
    advance(USER_GUILDS_TTL_MS);

    expect(await service.checkAccess(session, '1')).toBe('denied');
  });

  it('rejects access as soon as the bot leaves the guild', async () => {
    const { service, state } = setup([guild('1', 'Managed', MANAGE_GUILD)], ['1']);
    expect(await service.checkAccess(session, '1')).not.toBe('denied');

    state.botGuilds = new Set();
    expect(await service.checkAccess(session, '1')).toBe('denied');
  });

  it('reuses the user guild list within the TTL', async () => {
    const { service, getCurrentUserGuilds, advance } = setup(
      [guild('1', 'Managed', MANAGE_GUILD)],
      ['1'],
    );
    await service.listManageableGuilds(session);
    advance(USER_GUILDS_TTL_MS - 1);
    await service.checkAccess(session, '1');
    expect(getCurrentUserGuilds).toHaveBeenCalledTimes(1);
  });

  it('ends the session when Discord rejects the access token', async () => {
    const { service, getCurrentUserGuilds, end } = setup([], ['1']);
    getCurrentUserGuilds.mockRejectedValueOnce(new DiscordApiError(401, 'unauthorized'));
    expect(await service.checkAccess(session, '1')).toBeNull();
    expect(end).toHaveBeenCalledWith(session);
  });

  it('surfaces transient Discord failures without ending the session', async () => {
    const { service, getCurrentUserGuilds, end } = setup([], ['1']);
    getCurrentUserGuilds.mockRejectedValueOnce(new DiscordApiError(429, 'rate limited'));
    await expect(service.checkAccess(session, '1')).rejects.toBeInstanceOf(DiscordApiError);
    expect(end).not.toHaveBeenCalled();
  });

  it('reports an ended session when the Discord grant is gone', async () => {
    const { service, state } = setup([guild('1', 'Managed', MANAGE_GUILD)], ['1']);
    state.token = null;
    expect(await service.listManageableGuilds(session)).toBeNull();
    expect(await service.checkAccess(session, '1')).toBeNull();
  });
});

describe('BotGuildDirectory', () => {
  it('pages through every bot guild and caches the result', async () => {
    const firstPage = Array.from({ length: 200 }, (_, i) => ({ id: String(i + 1) }));
    const get = vi
      .fn()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([{ id: '201' }]);
    const directory = new BotGuildDirectory({ get }, () => 0);

    const ids = await directory.guildIds();
    await directory.guildIds();

    expect(ids.size).toBe(201);
    expect(get).toHaveBeenCalledTimes(2);
    const secondQuery = (get.mock.calls[1]![1] as { query: URLSearchParams }).query;
    expect(secondQuery.get('after')).toBe('200');
  });
});

describe('TtlCache', () => {
  it('shares in-flight loads, expires entries and does not cache failures', async () => {
    let now = 0;
    const cache = new TtlCache<string, number>(100, () => now);
    const load = vi.fn().mockResolvedValue(1);

    await Promise.all([cache.get('k', load), cache.get('k', load)]);
    expect(load).toHaveBeenCalledTimes(1);

    now = 100;
    await cache.get('k', load);
    expect(load).toHaveBeenCalledTimes(2);

    const failing = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(2);
    await expect(cache.get('f', failing)).rejects.toThrow('boom');
    expect(await cache.get('f', failing)).toBe(2);
  });
});
