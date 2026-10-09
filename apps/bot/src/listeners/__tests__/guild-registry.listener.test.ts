import { EventEmitter } from 'node:events';
import { AuditLogEvent, Events, type Client, type Guild } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findBotInviter, registerGuildRegistryListener } from '../guild-registry.listener.js';

const BOT_ID = '900000000000000001';
const tick = () => new Promise((resolve) => setImmediate(resolve));

interface FakeGuildOptions {
  name?: string;
  available?: boolean;
  audit?: () => Promise<unknown>;
  integrations?: () => Promise<unknown>;
}

const integration = (applicationId: string | null, userId: string | null) => ({
  application: applicationId ? { id: applicationId } : null,
  user: userId ? { id: userId } : null,
});

function fakeGuild(id: string, options: FakeGuildOptions = {}) {
  return {
    id,
    name: options.name ?? `Server ${id}`,
    ownerId: '100000000000000001',
    available: options.available ?? true,
    joinedAt: new Date('2026-10-01T00:00:00Z'),
    iconURL: () => `https://cdn.example/${id}.png`,
    fetchAuditLogs: vi.fn(
      options.audit ??
        (async () => ({
          entries: [
            { targetId: 'some-other-bot', executorId: 'wrong' },
            { targetId: BOT_ID, executorId: `inviter-of-${id}` },
          ],
        })),
    ),
    fetchIntegrations: vi.fn(options.integrations ?? (async () => new Map())),
  };
}

const denied = () =>
  Promise.reject(Object.assign(new Error('Missing Permissions'), { code: 50013 }));

describe('guild registry listener', () => {
  let client: EventEmitter & { user: { id: string }; guilds: { cache: Map<string, unknown> } };
  let repo: {
    upsert: ReturnType<typeof vi.fn>;
    markInactive: ReturnType<typeof vi.fn>;
    markInactiveExcept: ReturnType<typeof vi.fn>;
    setInviterIfMissing: ReturnType<typeof vi.fn>;
    listActiveIdsWithoutInviter: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
  };
  let log: { error: ReturnType<typeof vi.fn> };

  const register = () =>
    registerGuildRegistryListener(
      client as unknown as Client,
      { guildRepo: repo as never },
      log as never,
    );

  beforeEach(() => {
    client = Object.assign(new EventEmitter(), {
      user: { id: BOT_ID },
      guilds: { cache: new Map<string, unknown>() },
    });
    repo = {
      upsert: vi.fn().mockResolvedValue(undefined),
      markInactive: vi.fn().mockResolvedValue(undefined),
      markInactiveExcept: vi.fn().mockResolvedValue([]),
      setInviterIfMissing: vi.fn().mockResolvedValue(true),
      listActiveIdsWithoutInviter: vi.fn().mockResolvedValue([]),
      findById: vi.fn().mockResolvedValue(null),
    };
    log = { error: vi.fn() };
  });

  describe('ready', () => {
    it('records every cached guild, marks the others inactive and fills in missing inviters', async () => {
      const one = fakeGuild('g1');
      const two = fakeGuild('g2');
      client.guilds.cache.set('g1', one).set('g2', two);
      repo.listActiveIdsWithoutInviter.mockResolvedValue(['g2']);
      register();

      client.emit(Events.ClientReady);
      await tick();

      expect(repo.upsert).toHaveBeenCalledTimes(2);
      expect(repo.upsert).toHaveBeenCalledWith({
        id: 'g1',
        name: 'Server g1',
        iconUrl: 'https://cdn.example/g1.png',
        ownerId: '100000000000000001',
        joinedAt: new Date('2026-10-01T00:00:00Z'),
      });
      expect(repo.markInactiveExcept).toHaveBeenCalledWith(['g1', 'g2']);
      expect(one.fetchAuditLogs).not.toHaveBeenCalled();
      expect(two.fetchAuditLogs).toHaveBeenCalledWith({ type: AuditLogEvent.BotAdd, limit: 10 });
      expect(repo.setInviterIfMissing).toHaveBeenCalledOnce();
      expect(repo.setInviterIfMissing).toHaveBeenCalledWith('g2', 'inviter-of-g2', 'audit_log');
    });

    it('keeps an unavailable guild active without recording it', async () => {
      client.guilds.cache.set('down', fakeGuild('down', { available: false }));
      client.guilds.cache.set('up', fakeGuild('up'));
      register();

      client.emit(Events.ClientReady);
      await tick();

      expect(repo.upsert).toHaveBeenCalledOnce();
      expect(repo.markInactiveExcept).toHaveBeenCalledWith(['down', 'up']);
    });

    it('looks up one guild at a time', async () => {
      const order: string[] = [];
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const slow = fakeGuild('g1', {
        audit: async () => {
          order.push('g1 start');
          await gate;
          order.push('g1 end');
          return { entries: [] };
        },
      });
      const next = fakeGuild('g2', {
        audit: async () => {
          order.push('g2 start');
          return { entries: [] };
        },
      });
      client.guilds.cache.set('g1', slow).set('g2', next);
      repo.listActiveIdsWithoutInviter.mockResolvedValue(['g1', 'g2']);
      register();

      client.emit(Events.ClientReady);
      await tick();
      expect(order).toEqual(['g1 start']);

      release();
      await tick();
      expect(order).toEqual(['g1 start', 'g1 end', 'g2 start']);
    });

    it('skips inviter rows for guilds the bot no longer caches or that are down', async () => {
      client.guilds.cache.set('down', fakeGuild('down', { available: false }));
      repo.listActiveIdsWithoutInviter.mockResolvedValue(['gone', 'down']);
      register();

      client.emit(Events.ClientReady);
      await tick();

      expect(repo.setInviterIfMissing).not.toHaveBeenCalled();
    });

    it('logs a database error and does not throw', async () => {
      client.guilds.cache.set('g1', fakeGuild('g1'));
      repo.markInactiveExcept.mockRejectedValue(new Error('database is down'));
      register();

      client.emit(Events.ClientReady);
      await tick();

      expect(log.error).toHaveBeenCalledWith(
        '[GuildRegistry] Could not sync the servers on ready:',
        expect.any(Error),
      );
    });

    it('goes on with the other guilds after one fails', async () => {
      client.guilds.cache.set('g1', fakeGuild('g1')).set('g2', fakeGuild('g2'));
      repo.upsert.mockRejectedValueOnce(new Error('constraint'));
      repo.listActiveIdsWithoutInviter.mockResolvedValue(['g1', 'g2']);
      repo.setInviterIfMissing.mockRejectedValueOnce(new Error('constraint'));
      register();

      client.emit(Events.ClientReady);
      await tick();

      expect(repo.upsert).toHaveBeenCalledTimes(2);
      expect(repo.setInviterIfMissing).toHaveBeenCalledTimes(2);
      expect(log.error).toHaveBeenCalledTimes(2);
    });
  });

  describe('guild create', () => {
    it('records the guild and the inviter', async () => {
      const guild = fakeGuild('g1');
      register();

      client.emit(Events.GuildCreate, guild);
      await tick();

      expect(repo.upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'g1' }));
      expect(repo.setInviterIfMissing).toHaveBeenCalledWith('g1', 'inviter-of-g1', 'audit_log');
    });

    it('does not read the audit log again for a guild that already has an inviter', async () => {
      const guild = fakeGuild('g1');
      repo.findById.mockResolvedValue({ id: 'g1', invitedById: 'u1' });
      register();

      client.emit(Events.GuildCreate, guild);
      await tick();

      expect(repo.upsert).toHaveBeenCalledOnce();
      expect(guild.fetchAuditLogs).not.toHaveBeenCalled();
    });

    it('leaves the inviter empty when the audit log is forbidden', async () => {
      const guild = fakeGuild('g1', { audit: denied });
      register();

      client.emit(Events.GuildCreate, guild);
      await tick();

      expect(repo.upsert).toHaveBeenCalledOnce();
      expect(repo.setInviterIfMissing).not.toHaveBeenCalled();
      expect(log.error).not.toHaveBeenCalled();
    });

    it('leaves the inviter empty when the bot-add entry has expired', async () => {
      const guild = fakeGuild('g1', {
        audit: async () => ({ entries: [{ targetId: 'some-other-bot', executorId: 'x' }] }),
      });
      register();

      client.emit(Events.GuildCreate, guild);
      await tick();

      expect(repo.setInviterIfMissing).not.toHaveBeenCalled();
    });

    it('stores the integration user when the audit log is forbidden', async () => {
      const guild = fakeGuild('g1', {
        audit: denied,
        integrations: async () => new Map([['i1', integration(BOT_ID, 'integration-user')]]),
      });
      register();

      client.emit(Events.GuildCreate, guild);
      await tick();

      expect(repo.setInviterIfMissing).toHaveBeenCalledWith(
        'g1',
        'integration-user',
        'integration',
      );
    });

    it('logs an unexpected audit log error and still records the guild', async () => {
      const guild = fakeGuild('g1', { audit: () => Promise.reject(new Error('Discord is down')) });
      register();

      client.emit(Events.GuildCreate, guild);
      await tick();

      expect(repo.upsert).toHaveBeenCalledOnce();
      expect(repo.setInviterIfMissing).not.toHaveBeenCalled();
      expect(log.error).toHaveBeenCalledOnce();
    });

    it('logs a database error and does not throw', async () => {
      repo.upsert.mockRejectedValue(new Error('database is down'));
      register();

      client.emit(Events.GuildCreate, fakeGuild('g1'));
      await tick();

      expect(log.error).toHaveBeenCalledOnce();
    });
  });

  describe('guild update', () => {
    it('refreshes the name, icon and owner', async () => {
      register();

      client.emit(Events.GuildUpdate, fakeGuild('g1'), fakeGuild('g1', { name: 'Renamed' }));
      await tick();

      expect(repo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'g1', name: 'Renamed' }),
      );
    });

    it('logs a database error and does not throw', async () => {
      repo.upsert.mockRejectedValue(new Error('database is down'));
      register();

      client.emit(Events.GuildUpdate, fakeGuild('g1'), fakeGuild('g1'));
      await tick();

      expect(log.error).toHaveBeenCalledOnce();
    });
  });

  describe('guild delete', () => {
    it('marks a guild the bot left inactive', async () => {
      register();

      client.emit(Events.GuildDelete, fakeGuild('g1'));
      await tick();

      expect(repo.markInactive).toHaveBeenCalledWith(['g1']);
    });

    it('ignores an outage, where the guild is only unavailable', async () => {
      register();

      client.emit(Events.GuildDelete, fakeGuild('g1', { available: false }));
      await tick();

      expect(repo.markInactive).not.toHaveBeenCalled();
    });

    it('logs a database error and does not throw', async () => {
      repo.markInactive.mockRejectedValue(new Error('database is down'));
      register();

      client.emit(Events.GuildDelete, fakeGuild('g1'));
      await tick();

      expect(log.error).toHaveBeenCalledOnce();
    });
  });

  describe('findBotInviter', () => {
    it('returns the executor of the entry that targets the bot, from the audit log', async () => {
      const guild = fakeGuild('g1');
      expect(await findBotInviter(guild as unknown as Guild, BOT_ID)).toEqual({
        userId: 'inviter-of-g1',
        via: 'audit_log',
      });
      expect(guild.fetchIntegrations).not.toHaveBeenCalled();
    });

    it('falls back to the integration of the bot when the audit log names no one', async () => {
      const guild = fakeGuild('g1', {
        audit: async () => ({ entries: [] }),
        integrations: async () =>
          new Map([
            ['i1', integration('some-other-bot', 'wrong')],
            ['i2', integration(null, 'also-wrong')],
            ['i3', integration(BOT_ID, 'integration-user')],
          ]),
      });
      expect(await findBotInviter(guild as unknown as Guild, BOT_ID)).toEqual({
        userId: 'integration-user',
        via: 'integration',
      });
    });

    it('falls back to the integrations when the audit log is forbidden, without logging', async () => {
      const guild = fakeGuild('g1', {
        audit: denied,
        integrations: async () => new Map([['i1', integration(BOT_ID, 'integration-user')]]),
      });
      expect(await findBotInviter(guild as unknown as Guild, BOT_ID, log as never)).toEqual({
        userId: 'integration-user',
        via: 'integration',
      });
      expect(log.error).not.toHaveBeenCalled();
    });

    it('returns null when the integration of the bot has no user', async () => {
      const guild = fakeGuild('g1', {
        audit: async () => ({ entries: [] }),
        integrations: async () => new Map([['i1', integration(BOT_ID, null)]]),
      });
      expect(await findBotInviter(guild as unknown as Guild, BOT_ID)).toBeNull();
    });

    it('returns null without logging when both sources are forbidden', async () => {
      const guild = fakeGuild('g1', { audit: denied, integrations: denied });
      expect(await findBotInviter(guild as unknown as Guild, BOT_ID, log as never)).toBeNull();
      expect(log.error).not.toHaveBeenCalled();
    });

    it('logs an unexpected integrations error and returns null', async () => {
      const guild = fakeGuild('g1', {
        audit: async () => ({ entries: [] }),
        integrations: () => Promise.reject(new Error('Discord is down')),
      });
      expect(await findBotInviter(guild as unknown as Guild, BOT_ID, log as never)).toBeNull();
      expect(log.error).toHaveBeenCalledOnce();
    });

    it('returns null for a Missing Access error without logging', async () => {
      const guild = fakeGuild('g1', {
        audit: () => Promise.reject(Object.assign(new Error('Missing Access'), { code: 50001 })),
      });
      expect(await findBotInviter(guild as unknown as Guild, BOT_ID, log as never)).toBeNull();
      expect(log.error).not.toHaveBeenCalled();
    });
  });

  it('does nothing for the inviter while the bot user is unknown', async () => {
    const guild = fakeGuild('g1');
    (client as { user: unknown }).user = undefined;
    register();

    client.emit(Events.GuildCreate, guild);
    await tick();

    expect(guild.fetchAuditLogs).not.toHaveBeenCalled();
    expect(repo.upsert).toHaveBeenCalledOnce();
  });
});
