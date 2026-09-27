import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CommandOverride } from '@ririko/core';
import { createCommandOverrideMiddleware, overrideChannelId } from './overrides.js';
import { createCooldownMiddleware } from './cooldown.js';
import { CommandCategory, type Command, type CommandContext } from '../command/types.js';
import {
  CommandCooldownError,
  CommandDisabledError,
  CommandPermissionError,
} from '../errors/index.js';

const ROLE = '200000000000000001';
const OTHER_ROLE = '200000000000000002';

function command(name: string, cooldownSeconds?: number): Command {
  return {
    metadata: { name, category: CommandCategory.GAMES, description: name, cooldownSeconds },
    execute: vi.fn(),
  };
}

function override(fields: Partial<CommandOverride>): CommandOverride {
  return {
    command: 'rps',
    channelId: null,
    enabled: true,
    allowedRoleIds: [],
    blockedRoleIds: [],
    cooldownSeconds: null,
    ...fields,
  };
}

function member(roleIds: string[], manageGuild = false) {
  return {
    roles: { cache: new Map(roleIds.map((id) => [id, {}])) },
    permissions: { has: () => manageGuild },
  };
}

function context(fields: Record<string, unknown> = {}): CommandContext {
  return {
    command: command('rps'),
    commandName: 'rps',
    guildId: 'g1',
    guild: { members: { fetch: vi.fn() } },
    channelId: 'ch1',
    channel: { isThread: () => false },
    user: { id: 'u1' },
    member: member([]),
    ...fields,
  } as unknown as CommandContext;
}

describe('CommandOverrideMiddleware (TASK-1631)', () => {
  const next = vi.fn().mockResolvedValue(undefined);
  const resolve = vi.fn<(...args: unknown[]) => Promise<CommandOverride | null>>();
  const mw = createCommandOverrideMiddleware({ resolve });

  beforeEach(() => {
    next.mockClear();
    resolve.mockReset();
  });

  it('runs commands without an override', async () => {
    resolve.mockResolvedValue(null);
    await mw(context(), next);
    expect(resolve).toHaveBeenCalledWith('g1', 'ch1', 'rps');
    expect(next).toHaveBeenCalledOnce();
  });

  it('blocks disabled commands, naming where', async () => {
    resolve.mockResolvedValue(override({ enabled: false }));
    await expect(mw(context(), next)).rejects.toThrow('`rps` is disabled in this server.');

    resolve.mockResolvedValue(override({ enabled: false, channelId: 'ch1' }));
    await expect(mw(context(), next)).rejects.toThrow(CommandDisabledError);
    await expect(mw(context(), next)).rejects.toThrow('in this channel');
    expect(next).not.toHaveBeenCalled();
  });

  it('blocks a blocked role even when the member also holds an allowed role', async () => {
    resolve.mockResolvedValue(override({ allowedRoleIds: [ROLE], blockedRoleIds: [OTHER_ROLE] }));
    await expect(mw(context({ member: member([ROLE, OTHER_ROLE]) }), next)).rejects.toThrow(
      CommandPermissionError,
    );
  });

  it('requires one allowed role when the list is not empty', async () => {
    resolve.mockResolvedValue(override({ allowedRoleIds: [ROLE] }));
    await expect(mw(context({ member: member([OTHER_ROLE]) }), next)).rejects.toThrow(
      '`rps` is limited to certain roles in this server.',
    );
    await mw(context({ member: member([ROLE]) }), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('lets Manage Server members bypass every rule', async () => {
    resolve.mockResolvedValue(override({ enabled: false, allowedRoleIds: [ROLE] }));
    await mw(context({ member: member([], true) }), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('fetches the member when a slash interaction only carries the raw API member', async () => {
    resolve.mockResolvedValue(override({ allowedRoleIds: [ROLE] }));
    const fetch = vi.fn().mockResolvedValue(member([ROLE]));
    await mw(context({ member: { roles: [ROLE] }, guild: { members: { fetch } } }), next);
    expect(fetch).toHaveBeenCalledWith('u1');
    expect(next).toHaveBeenCalledOnce();
  });

  it('skips exempt commands and DMs without resolving', async () => {
    await mw(context({ command: command('help'), commandName: 'help' }), next);
    await mw(context({ guildId: null, guild: null }), next);
    expect(resolve).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('keys threads by their parent channel', () => {
    expect(
      overrideChannelId(
        context({ channelId: 'thread1', channel: { isThread: () => true, parentId: 'ch1' } }),
      ),
    ).toBe('ch1');
    expect(overrideChannelId(context())).toBe('ch1');
  });
});

describe('CooldownMiddleware with an async override', () => {
  it('uses the resolved seconds and falls back to the command cooldown', async () => {
    vi.useFakeTimers();
    const next = vi.fn().mockResolvedValue(undefined);
    const seconds = vi.fn<() => Promise<number | undefined>>();
    const mw = createCooldownMiddleware({ getCooldownSeconds: seconds });

    seconds.mockResolvedValue(0);
    const ctx = context({ command: command('rps', 10) });
    await mw(ctx, next);
    await mw(ctx, next);
    expect(next).toHaveBeenCalledTimes(2);

    seconds.mockResolvedValue(undefined);
    await mw(ctx, next);
    await expect(mw(ctx, next)).rejects.toThrow(CommandCooldownError);
    vi.useRealTimers();
  });
});
