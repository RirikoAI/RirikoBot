import { EventEmitter } from 'node:events';
import type { Client } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '@ririko/core';
import { LevelRoleService } from '@ririko/services';
import { registerLevelRolesListener } from '../level-roles.listener.js';

const tick = () => new Promise((resolve) => setImmediate(resolve));

function levelUp(overrides: Partial<Parameters<EventBus['emit']>[1]> = {}) {
  return {
    userId: 'user-1',
    guildId: 'guild-1',
    previousLevel: 4,
    newLevel: 5,
    levelsGained: 1,
    totalXp: 500,
    shouldNotify: false,
    ...overrides,
  } as never;
}

describe('registerLevelRolesListener (TASK-2004)', () => {
  let client: EventEmitter & { guilds: { cache: Map<string, unknown> } };
  let eventBus: EventBus;
  let applyForMember: ReturnType<typeof vi.fn>;
  let getAccount: ReturnType<typeof vi.fn>;
  let errors: ReturnType<typeof vi.spyOn>;
  let fetchMember: ReturnType<typeof vi.fn>;
  const member = { id: 'user-1', user: { bot: false }, guild: { id: 'guild-1' } };

  beforeEach(() => {
    client = Object.assign(new EventEmitter(), { guilds: { cache: new Map<string, unknown>() } });
    fetchMember = vi.fn().mockResolvedValue(member);
    client.guilds.cache.set('guild-1', { id: 'guild-1', members: { fetch: fetchMember } });
    eventBus = new EventBus();
    applyForMember = vi.fn().mockResolvedValue({ added: [], removed: [], skipped: [] });
    getAccount = vi.fn().mockResolvedValue({ userId: 'user-1', guildId: 'guild-1', level: 7 });
    errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    registerLevelRolesListener(client as unknown as Client, {
      eventBus,
      levelRoleService: { applyForMember } as unknown as LevelRoleService,
      xpRepo: { getAccount } as never,
    });
  });

  afterEach(() => {
    errors.mockRestore();
  });

  describe('leveling:levelUp', () => {
    it('fetches the member and applies the rewards for the new level', async () => {
      eventBus.emit('leveling:levelUp', levelUp({ newLevel: 20 }));
      await tick();
      expect(fetchMember).toHaveBeenCalledWith('user-1');
      expect(applyForMember).toHaveBeenCalledWith(member, 20);
    });

    it('runs whatever the announcement settings say', async () => {
      eventBus.emit('leveling:levelUp', levelUp({ shouldNotify: true }));
      eventBus.emit('leveling:levelUp', levelUp({ shouldNotify: false }));
      await tick();
      expect(applyForMember).toHaveBeenCalledTimes(2);
    });

    it('skips a server Ririko left', async () => {
      eventBus.emit('leveling:levelUp', levelUp({ guildId: 'guild-2' }));
      await tick();
      expect(fetchMember).not.toHaveBeenCalled();
      expect(applyForMember).not.toHaveBeenCalled();
    });

    it('skips a member who left the server', async () => {
      fetchMember.mockRejectedValue(new Error('Unknown Member'));
      eventBus.emit('leveling:levelUp', levelUp());
      await tick();
      expect(applyForMember).not.toHaveBeenCalled();
      expect(errors).not.toHaveBeenCalled();
    });

    it('logs an error from the service and does not throw', async () => {
      applyForMember.mockRejectedValue(new Error('boom'));
      eventBus.emit('leveling:levelUp', levelUp());
      await tick();
      expect(errors).toHaveBeenCalledWith(
        expect.stringContaining('guild-1'),
        expect.objectContaining({ message: 'boom' }),
      );
    });
  });

  describe('guildMemberAdd', () => {
    const rejoin = async (joined: unknown) => {
      client.emit('guildMemberAdd', joined);
      await tick();
    };

    it('applies the rewards for the level the member had', async () => {
      await rejoin(member);
      expect(getAccount).toHaveBeenCalledWith('user-1', 'guild-1');
      expect(applyForMember).toHaveBeenCalledWith(member, 7);
    });

    it('skips a member with level 0', async () => {
      getAccount.mockResolvedValue({ level: 0 });
      await rejoin(member);
      expect(applyForMember).not.toHaveBeenCalled();
    });

    it('skips a member with no XP account', async () => {
      getAccount.mockResolvedValue(null);
      await rejoin(member);
      expect(applyForMember).not.toHaveBeenCalled();
    });

    it('skips bots without reading their XP', async () => {
      await rejoin({ ...member, user: { bot: true } });
      expect(getAccount).not.toHaveBeenCalled();
      expect(applyForMember).not.toHaveBeenCalled();
    });

    it('logs an error from the account read and does not throw', async () => {
      getAccount.mockRejectedValue(new Error('db down'));
      await rejoin(member);
      expect(applyForMember).not.toHaveBeenCalled();
      expect(errors).toHaveBeenCalledWith(
        expect.stringContaining('guild-1'),
        expect.objectContaining({ message: 'db down' }),
      );
    });

    it('logs an error from the service and does not throw', async () => {
      applyForMember.mockRejectedValue(new Error('boom'));
      await rejoin(member);
      expect(errors).toHaveBeenCalledTimes(1);
    });
  });

  describe('with the real service', () => {
    it('gives nothing when the server has no rewards', async () => {
      const add = vi.fn();
      const service = new LevelRoleService({
        settings: { get: vi.fn().mockResolvedValue(null) } as never,
        xp: { listMembersAtLevel: vi.fn() } as never,
      });
      const bus = new EventBus();
      const joinClient = Object.assign(new EventEmitter(), { guilds: { cache: new Map() } });
      registerLevelRolesListener(joinClient as unknown as Client, {
        eventBus: bus,
        levelRoleService: service,
        xpRepo: { getAccount } as never,
      });
      joinClient.emit('guildMemberAdd', {
        ...member,
        roles: { cache: new Map(), add },
        guild: { id: 'guild-1' },
      });
      await tick();
      expect(getAccount).toHaveBeenCalledTimes(1);
      expect(add).not.toHaveBeenCalled();
    });
  });
});
