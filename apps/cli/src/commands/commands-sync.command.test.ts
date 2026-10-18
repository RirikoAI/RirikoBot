import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { Routes } from 'discord.js';

const state = vi.hoisted(() => ({
  put: vi.fn(async (_route: string, _options?: unknown) => []),
  get: vi.fn(async (_route: string, _options?: unknown) => [] as unknown[]),
  tokens: [] as string[],
  destroyed: 0,
  dbClosed: 0,
  dbConfigs: [] as unknown[],
  registerOptions: [] as Array<{ prefix: string }>,
}));

vi.mock('@ririko/bot', async () => {
  const discord = await vi.importActual<typeof import('@ririko/discord')>('@ririko/discord');
  return {
    createBot: () => ({
      client: {
        destroy: async () => {
          state.destroyed += 1;
        },
      },
    }),
    createBotServices: async () => ({}),
    createCommandControllers: () => ({}),
    registerBotCommands: (
      registry: InstanceType<typeof discord.CommandRegistry>,
      options: { prefix: string },
    ) => {
      state.registerOptions.push(options);
      registry.registerAll([
        {
          metadata: {
            name: 'ping',
            category: discord.CommandCategory.GENERAL,
            description: 'ping',
          },
          execute: async () => {},
        },
        {
          metadata: {
            name: 'ban',
            category: discord.CommandCategory.GENERAL,
            description: 'ban',
            registrationScope: 'guild',
          },
          execute: async () => {},
        },
      ]);
    },
  };
});

vi.mock('@ririko/database', () => ({
  createDatabaseClient: async (config: unknown) => {
    state.dbConfigs.push(config);
    return {
      close: async () => {
        state.dbClosed += 1;
      },
    };
  },
}));

vi.mock('@ririko/discord', async () => {
  const actual = await vi.importActual<typeof import('@ririko/discord')>('@ririko/discord');
  return {
    ...actual,
    createRestClient: (token: string) => {
      state.tokens.push(token);
      return { put: state.put, get: state.get };
    },
  };
});

import { registerCommandsSyncCommand } from './commands-sync.js';

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g;

const GUILD = '130412481841280206';

describe('ririko commands:sync action (TASK-1252)', () => {
  let out: string[];

  const output = () => out.join('\n').replace(ANSI, '');

  const run = async (...args: string[]) => {
    const program = new Command();
    program.exitOverride();
    registerCommandsSyncCommand(program);
    await program.parseAsync(['node', 'ririko', 'commands:sync', ...args]);
  };

  beforeEach(() => {
    out = [];
    state.put.mockClear();
    state.get.mockReset();
    state.get.mockResolvedValue([]);
    state.tokens = [];
    state.destroyed = 0;
    state.dbClosed = 0;
    state.dbConfigs = [];
    state.registerOptions = [];
    vi.stubEnv('DISCORD_TOKEN', 'token-a');
    vi.stubEnv('DISCORD_BOT_TOKEN', '');
    vi.stubEnv('DISCORD_CLIENT_ID', 'app-1');
    vi.stubEnv('DISCORD_APPLICATION_ID', '');
    vi.stubEnv('DEFAULT_PREFIX', '');
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      out.push(args.join(' '));
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('refuses to run without a token or application ID', async () => {
    vi.stubEnv('DISCORD_TOKEN', '');
    await expect(run('--global')).rejects.toThrow(
      'DISCORD_TOKEN and DISCORD_CLIENT_ID must be set.',
    );
    expect(state.tokens).toEqual([]);
    expect(state.put).not.toHaveBeenCalled();

    vi.stubEnv('DISCORD_TOKEN', 'token-a');
    vi.stubEnv('DISCORD_CLIENT_ID', '');
    await expect(run('--global')).rejects.toThrow('must be set');
  });

  it('registers the global commands and releases the bot and database afterwards', async () => {
    await run('--global');
    expect(state.tokens).toEqual(['token-a']);
    expect(state.dbConfigs).toEqual([{ dialect: 'sqlite', url: ':memory:', autoMigrate: true }]);
    expect(state.put).toHaveBeenCalledWith(Routes.applicationCommands('app-1'), {
      body: [{ name: 'ping', description: 'ping' }],
    });
    const text = output();
    expect(text).toContain('✔ global: registered 1 command(s)');
    expect(text).toContain('Global command changes can take a while to show');
    expect(state.destroyed).toBe(1);
    expect(state.dbClosed).toBe(1);
  });

  it('accepts the legacy token and application ID variable names', async () => {
    vi.stubEnv('DISCORD_TOKEN', '');
    vi.stubEnv('DISCORD_BOT_TOKEN', 'token-b');
    vi.stubEnv('DISCORD_CLIENT_ID', '');
    vi.stubEnv('DISCORD_APPLICATION_ID', 'app-2');
    await run('--global');
    expect(state.tokens).toEqual(['token-b']);
    expect(state.put).toHaveBeenCalledWith(Routes.applicationCommands('app-2'), expect.anything());
  });

  it('passes the configured default prefix to the command registration', async () => {
    vi.stubEnv('DEFAULT_PREFIX', '?');
    await run();
    expect(state.registerOptions.map((o) => o.prefix)).toEqual(['?']);
  });

  it('only reports slot usage without a target', async () => {
    await run();
    expect(output()).toContain('Nothing registered. Pass --global');
    expect(state.put).not.toHaveBeenCalled();
    expect(state.destroyed).toBe(1);
    expect(state.dbClosed).toBe(1);
  });

  it('registers each repeated --guild and releases resources', async () => {
    await run('--guild', GUILD, '--guild', '131101529770426380');
    expect(state.put.mock.calls.map((c) => c[0])).toEqual([
      Routes.applicationGuildCommands('app-1', GUILD),
      Routes.applicationGuildCommands('app-1', '131101529770426380'),
    ]);
    expect(output()).toContain(`✔ guild (${GUILD}): registered 1 command(s)`);
    expect(state.destroyed).toBe(1);
  });

  it('registers every bot server with --all-guilds', async () => {
    state.get.mockResolvedValue([{ id: GUILD, name: 'Home' }]);
    await run('--all-guilds');
    expect(output()).toContain(`✔ guild Home (${GUILD}): registered 1 command(s)`);
  });

  it('still releases the bot and database when a server ID is invalid', async () => {
    await expect(run('--guild', 'nope')).rejects.toThrow('Not a Discord server ID: nope');
    expect(state.put).not.toHaveBeenCalled();
    expect(state.destroyed).toBe(1);
    expect(state.dbClosed).toBe(1);
  });
});
