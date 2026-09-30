import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { CommandSynchronizer } from '@ririko/discord';
import { Events, type Client, type REST } from 'discord.js';
import { registerGuildJoinCommandSync, syncCommandsOnStartup } from './command-sync.js';

function fakeSync(failGuild?: string) {
  const syncGlobal = vi.fn(async () => ({ registeredCount: 68 }));
  const syncGuild = vi.fn(async (_app: string, guildId: string) => {
    if (guildId === failGuild) throw new Error('Missing Access');
    return { registeredCount: 31 };
  });
  return {
    sync: { syncGlobal, syncGuild } as unknown as CommandSynchronizer,
    syncGlobal,
    syncGuild,
  };
}

const log = () => ({ log: vi.fn(), error: vi.fn() });

describe('syncCommandsOnStartup', () => {
  it('registers the global set and the per-server set in the dev guild only', async () => {
    const { sync, syncGlobal, syncGuild } = fakeSync();
    const get = vi.fn();
    const logger = log();
    await syncCommandsOnStartup({
      sync,
      rest: { get } as unknown as REST,
      applicationId: 'app',
      devGuildId: 'dev',
      log: logger,
    });
    expect(syncGlobal).toHaveBeenCalledWith('app');
    expect(syncGuild.mock.calls).toEqual([['app', 'dev']]);
    expect(get).not.toHaveBeenCalled();
    expect(logger.log).toHaveBeenLastCalledWith(
      '✓ Registered per-server commands in 1/1 server(s).',
    );
  });

  it('registers every guild without a dev guild and keeps going past failures', async () => {
    const { sync, syncGuild } = fakeSync('g2');
    const get = vi.fn(async () => [
      { id: 'g1', name: 'One' },
      { id: 'g2', name: 'Two' },
    ]);
    const logger = log();
    await syncCommandsOnStartup({
      sync,
      rest: { get } as unknown as REST,
      applicationId: 'app',
      log: logger,
    });
    expect(syncGuild.mock.calls.map(([, id]) => id)).toEqual(['g1', 'g2']);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenLastCalledWith(
      '✓ Registered per-server commands in 1/2 server(s).',
    );
  });

  it('still registers per-server commands when the global sync fails', async () => {
    const { sync, syncGlobal, syncGuild } = fakeSync();
    syncGlobal.mockRejectedValueOnce(new Error('limit'));
    const logger = log();
    await syncCommandsOnStartup({
      sync,
      rest: {} as REST,
      applicationId: 'app',
      devGuildId: 'dev',
      log: logger,
    });
    expect(logger.error).toHaveBeenCalledWith(
      '✖ Failed to register global commands:',
      expect.any(Error),
    );
    expect(syncGuild).toHaveBeenCalledWith('app', 'dev');
  });
});

describe('registerGuildJoinCommandSync', () => {
  it('registers the per-server commands in a server the bot joins', async () => {
    const client = new EventEmitter() as unknown as Client;
    const { sync, syncGuild } = fakeSync('bad');
    const logger = log();
    registerGuildJoinCommandSync(client, sync, 'app', logger);

    client.emit(Events.GuildCreate, { id: 'new' } as never);
    client.emit(Events.GuildCreate, { id: 'bad' } as never);
    await vi.waitFor(() => expect(logger.error).toHaveBeenCalledTimes(1));
    expect(syncGuild.mock.calls).toEqual([
      ['app', 'new'],
      ['app', 'bad'],
    ]);
  });
});
