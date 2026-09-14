import { describe, expect, it } from 'vitest';
import { AppError, SettingsService, assertTargetHierarchy, createLogger, loadConfig, publicError, requireDiscordCredentials, type ActorContext, type GuildSettings, type GuildSettingsStore } from './index.js';

const manager: ActorContext = { userId: '2', guildId: '1', roles: [], permissions: ['ManageGuild'], botPermissions: [], isOwner: false };

function memoryStore(): GuildSettingsStore & { calls: number } {
  const records = new Map<string, GuildSettings>();
  return {
    calls: 0,
    async get(id) { this.calls++; return records.get(id); },
    async save(settings, revision) {
      if ((records.get(settings.guildId)?.revision ?? 0) !== revision) throw new AppError('CONFLICT', 'Settings changed.');
      const updated = structuredClone({ ...settings, revision: revision + 1 });
      records.set(updated.guildId, updated);
      return updated;
    },
  };
}

describe('configuration', () => {
  it('has offline defaults but requires explicit gateway credentials', () => {
    const config = loadConfig({});
    expect(config.database).toEqual({ dialect: 'sqlite', url: 'data/ririko.db' });
    expect(() => requireDiscordCredentials(config)).toThrow('DISCORD_TOKEN');
  });
  it('does not include credential values in validation failures', () => {
    expect(() => loadConfig({ DATABASE_DIALECT: 'postgres', DATABASE_URL: 'super-secret' })).toThrow('PostgreSQL connection URL');
    try { loadConfig({ DISCORD_APPLICATION_ID: 'secret-application-value' }); } catch (error) {
      expect(String(error)).not.toContain('secret-application-value');
    }
  });
  it('rejects malformed prefixes, owner IDs and ports', () => {
    for (const env of [{ DEFAULT_PREFIX: ' ' }, { BOT_OWNER_IDS: 'abc' }, { HEALTH_PORT: '-1' }]) {
      expect(() => loadConfig(env)).toThrow(AppError);
    }
  });
});

describe('shared settings service', () => {
  it('checks manager permission even for a bot owner', async () => {
    const service = new SettingsService(memoryStore());
    await expect(service.setPrefix({ ...manager, permissions: [], isOwner: true }, '?')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const dm = { ...manager };
    delete dm.guildId;
    await expect(service.setPrefix(dm, '?')).rejects.toMatchObject({ code: 'GUILD_ONLY' });
  });
  it('bounds cache lifetime and isolates returned objects', async () => {
    let now = 0;
    const store = memoryStore();
    const service = new SettingsService(store, '!', undefined, () => now);
    const first = await service.get('1');
    first.prefix = 'bad';
    expect((await service.get('1')).prefix).toBe('!');
    expect(store.calls).toBe(1);
    now = 5001;
    await service.get('1');
    expect(store.calls).toBe(2);
  });
  it('persists a prefix and invalidates cached values', async () => {
    const service = new SettingsService(memoryStore());
    await service.get('1');
    expect(await service.setPrefix(manager, '?')).toMatchObject({ prefix: '?', revision: 1 });
    expect((await service.get('1')).prefix).toBe('?');
    await expect(service.setPrefix(manager, 'a b')).rejects.toMatchObject({ code: 'VALIDATION' });
  });
  it('refuses unknown modules and keeps administration enabled', async () => {
    const service = new SettingsService(memoryStore());
    await expect(service.setModule(manager, 'imaginary', true)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.setModule(manager, 'core', false)).rejects.toMatchObject({ code: 'VALIDATION' });
  });
  it('does not replace a database failure with permissive defaults', async () => {
    const service = new SettingsService({ get: () => Promise.reject(new Error('database unavailable')), save: () => Promise.reject(new Error()) });
    await expect(service.get('1')).rejects.toThrow('database unavailable');
  });
});

it('enforces both actor and bot target hierarchy', () => {
  const target = { actorId: '1', botId: '2', targetId: '3', guildOwnerId: '4', actorHighestRole: 10, botHighestRole: 9, targetHighestRole: 8 };
  expect(() => assertTargetHierarchy(target)).not.toThrow();
  expect(() => assertTargetHierarchy({ ...target, botHighestRole: 8 })).toThrow(AppError);
  expect(() => assertTargetHierarchy({ ...target, actorHighestRole: 8 })).toThrow(AppError);
  expect(() => assertTargetHierarchy({ ...target, targetId: '4' })).toThrow(AppError);
});

it('redacts credentials and only exposes known safe errors', () => {
  const lines: string[] = [];
  const logger = createLogger('info', { write: (line) => { lines.push(line); } });
  logger.info({ token: 'private-token', discord: { token: 'nested-secret' }, userId: '42' }, 'event');
  expect(lines.join('')).not.toContain('private-token');
  expect(lines.join('')).not.toContain('nested-secret');
  expect(lines.join('')).toContain('42');
  expect(publicError(new Error('database password leaked'))).not.toContain('password');
  expect(publicError(new AppError('FORBIDDEN', 'Access denied.'))).toBe('Access denied.');
});
