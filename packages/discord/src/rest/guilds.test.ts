import { describe, expect, it, vi } from 'vitest';
import { Routes, type REST } from 'discord.js';
import { listBotGuilds } from './guilds.js';

describe('listBotGuilds', () => {
  it('pages through /users/@me/guilds until a short page', async () => {
    const full = Array.from({ length: 200 }, (_, i) => ({
      id: `g${i}`,
      name: `G${i}`,
      icon: null,
    }));
    const get = vi.fn(async (_route: string, { query }: { query: URLSearchParams }) =>
      query.get('after') === 'g199' ? [{ id: 'g200', name: 'Last' }] : full,
    );
    const guilds = await listBotGuilds({ get } as unknown as REST);
    expect(guilds).toHaveLength(201);
    expect(guilds[0]).toEqual({ id: 'g0', name: 'G0' });
    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls[0]?.[0]).toBe(Routes.userGuilds());
    expect(get.mock.calls[0]?.[1].query.get('limit')).toBe('200');
  });
});
