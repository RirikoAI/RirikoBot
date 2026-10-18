import { describe, expect, it, vi } from 'vitest';
import {
  CommandCategory,
  CommandRegistry,
  CommandSynchronizer,
  type Command,
} from '@ririko/discord';
import { Routes, type REST } from 'discord.js';
import { runCommandsSync, type SyncTargets } from './commands-sync.js';

// Strip terminal colours so assertions read plainly.
// eslint-disable-next-line no-control-regex
const plain = (lines: string[]) => lines.map((line) => line.replace(/\x1b\[[0-9;]*m/g, ''));

const APP = 'app-1';
const HOME = '130412481841280206';
const OTHER = '131101529770426380';

const command = (name: string, registrationScope?: 'guild'): Command => ({
  metadata: {
    name,
    category: CommandCategory.GENERAL,
    description: name,
    ...(registrationScope ? { registrationScope } : {}),
  },
  execute: vi.fn(),
});

function setup(commands: Command[] = [command('ping'), command('ban', 'guild')]) {
  const put = vi.fn(async (route: string) => {
    if (route.includes(OTHER)) throw new Error('Missing Access');
    return [];
  });
  const get = vi.fn(async () => [
    { id: HOME, name: 'Home' },
    { id: OTHER, name: 'Locked' },
  ]);
  const rest = { put, get } as unknown as REST;
  const sync = new CommandSynchronizer(rest, new CommandRegistry().registerAll(commands));
  return { rest, sync, put, get };
}

const targets = (overrides: Partial<SyncTargets>): SyncTargets => ({
  global: false,
  guildIds: [],
  allGuilds: false,
  ...overrides,
});

describe('ririko commands:sync', () => {
  it('only reports slot usage without a target', async () => {
    const { rest, sync, put } = setup();
    const lines = plain(await runCommandsSync(sync, rest, APP, targets({})));
    expect(lines).toEqual([
      'global: slash 1/100 (99 free), message menus 0/15 (15 free), user menus 0/15 (15 free)',
      'per server: slash 1/100 (99 free)',
      'Nothing registered. Pass --global, --guild <id> or --all-guilds to register commands.',
    ]);
    expect(put).not.toHaveBeenCalled();
  });

  it('registers the global scope', async () => {
    const { rest, sync, put } = setup();
    const lines = plain(await runCommandsSync(sync, rest, APP, targets({ global: true })));
    expect(put).toHaveBeenCalledWith(Routes.applicationCommands(APP), {
      body: [{ name: 'ping', description: 'ping' }],
    });
    expect(lines[0]).toBe('✔ global: registered 1 command(s)');
  });

  it('registers the guild scope in the given servers', async () => {
    const { rest, sync, put, get } = setup();
    const lines = plain(await runCommandsSync(sync, rest, APP, targets({ guildIds: [HOME] })));
    expect(put.mock.calls).toEqual([
      [Routes.applicationGuildCommands(APP, HOME), { body: [{ name: 'ban', description: 'ban' }] }],
    ]);
    expect(get).not.toHaveBeenCalled();
    expect(lines).toEqual([`✔ guild (${HOME}): registered 1 command(s)`]);
  });

  it('registers every server the bot is in and reports per-server failures', async () => {
    const { rest, sync } = setup();
    const lines = plain(await runCommandsSync(sync, rest, APP, targets({ allGuilds: true })));
    expect(lines).toEqual([
      `✔ guild Home (${HOME}): registered 1 command(s)`,
      `✖ guild Locked (${OTHER}): Missing Access`,
    ]);
  });

  it('rejects a server ID that is not a snowflake', async () => {
    const { rest, sync, put } = setup();
    await expect(
      runCommandsSync(sync, rest, APP, targets({ guildIds: ['my-server'] })),
    ).rejects.toThrow('Not a Discord server ID: my-server');
    expect(put).not.toHaveBeenCalled();
  });

  it('writes nothing when either scope is over the limit', async () => {
    const crowded = Array.from({ length: 101 }, (_, i) => command(`admin${i}`, 'guild'));
    const { rest, sync, put } = setup([command('ping'), ...crowded]);
    await expect(runCommandsSync(sync, rest, APP, targets({ global: true }))).rejects.toThrow(
      'The guild command scope exceeds',
    );
    expect(put).not.toHaveBeenCalled();
  });
});
