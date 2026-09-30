import { describe, expect, it, vi } from 'vitest';
import { Routes, type REST } from 'discord.js';
import { runCommandsReset, scanRegisteredCommands } from './commands-reset.js';

// Strip terminal colours so assertions read plainly.
// eslint-disable-next-line no-control-regex
const plain = (lines: string[]) => lines.map((line) => line.replace(/\x1b\[[0-9;]*m/g, ''));

const APP = 'app-1';

function fakeRest(responses: Record<string, unknown>, failing: string[] = []) {
  const get = vi.fn(async (route: string, options?: { query?: URLSearchParams }) => {
    if (failing.includes(route)) throw new Error('Missing Access');
    if (route === Routes.userGuilds()) {
      return options?.query?.get('after') ? [] : responses[route];
    }
    return responses[route] ?? [];
  });
  const put = vi.fn(async () => []);
  return { rest: { get, put } as unknown as REST, get, put };
}

describe('ririko commands:reset', () => {
  const responses = {
    [Routes.applicationCommands(APP)]: [{ name: 'ping' }, { name: 'oldrank' }],
    [Routes.userGuilds()]: [
      { id: 'g1', name: 'Home' },
      { id: 'g2', name: 'Empty' },
      { id: 'g3', name: 'Locked' },
    ],
    [Routes.applicationGuildCommands(APP, 'g1')]: [{ name: 'legacy' }],
  };

  it('finds global and guild commands, skipping empty and unreadable guilds', async () => {
    const { rest } = fakeRest(responses, [Routes.applicationGuildCommands(APP, 'g3')]);
    expect(await scanRegisteredCommands(rest, APP)).toEqual({
      scopes: [
        { names: ['ping', 'oldrank'] },
        { guildId: 'g1', guildName: 'Home', names: ['legacy'] },
      ],
      unreadableGuilds: ['g3'],
    });
  });

  it('only lists commands without --yes', async () => {
    const { rest, put } = fakeRest(responses);
    const lines = plain(await runCommandsReset(rest, APP, false));
    expect(lines).toEqual([
      'global: 2 command(s) — ping, oldrank',
      'guild Home (g1): 1 command(s) — legacy',
      'Run again with --yes to remove them.',
    ]);
    expect(put).not.toHaveBeenCalled();
  });

  it('clears every scope that has commands with --yes', async () => {
    const { rest, put } = fakeRest(responses);
    const lines = plain(await runCommandsReset(rest, APP, true));
    expect(put.mock.calls).toEqual([
      [Routes.applicationCommands(APP), { body: [] }],
      [Routes.applicationGuildCommands(APP, 'g1'), { body: [] }],
    ]);
    expect(lines.at(-1)).toContain('Removed commands from 2 scope(s)');
  });

  it('reports when nothing is registered', async () => {
    const { rest, put } = fakeRest({ [Routes.userGuilds()]: [] });
    expect(plain(await runCommandsReset(rest, APP, true))).toEqual([
      'No registered commands found.',
    ]);
    expect(put).not.toHaveBeenCalled();
  });
});
