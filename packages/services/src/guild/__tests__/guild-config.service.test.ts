import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AuditLogRepository,
  createDatabaseClient,
  GuildConfigVersionRepository,
  GuildSettingsRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import {
  diffFields,
  GuildConfigService,
  GuildConfigValidationError,
  type GuildConfigActor,
} from '../guild-config.service.js';

const NOW = new Date('2026-09-25T00:00:00Z');
const dashboardActor: GuildConfigActor = {
  userId: 'user-1',
  source: 'dashboard',
  ipAddress: '203.0.113.7',
  userAgent: 'vitest',
};

describe('GuildConfigService (TASK-1111)', () => {
  let db: SqliteDatabaseClient;
  let versions: GuildConfigVersionRepository;
  let service: GuildConfigService;

  beforeEach(async () => {
    const raw = await createDatabaseClient({
      dialect: 'sqlite',
      url: ':memory:',
      autoMigrate: true,
    });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    db = raw;
    versions = new GuildConfigVersionRepository(db);
    service = new GuildConfigService({
      db,
      guildSettings: new GuildSettingsRepository(db),
      versions,
      audit: new AuditLogRepository(db),
      defaultPrefix: '!',
      now: () => NOW,
    });
  });

  afterEach(async () => {
    await db.close();
  });

  const auditRows = () =>
    db.raw
      .prepare(
        'SELECT guild_id, actor_user_id, action, details, ip_address, user_agent FROM audit_logs',
      )
      .all() as Array<Record<string, string>>;

  it('returns defaults for a guild without settings', async () => {
    expect(await service.get('g1', 'general')).toEqual({ prefix: '!', timezone: 'UTC' });
  });

  it('validates, saves, bumps the change feed and audits the field diff', async () => {
    const result = await service.update(
      'g1',
      'general',
      { prefix: ' ?? ', timezone: 'asia/tokyo' },
      dashboardActor,
    );

    expect(result.values).toEqual({ prefix: '??', timezone: 'Asia/Tokyo' });
    expect(await service.get('g1', 'general')).toEqual(result.values);
    expect((await versions.listChangedSince(new Date(0)))[0]).toMatchObject({
      guildId: 'g1',
      module: 'general',
      version: 1,
    });

    const [audit] = auditRows();
    expect(audit).toMatchObject({
      guild_id: 'g1',
      actor_user_id: 'user-1',
      action: 'guild_config.general.update',
      ip_address: '203.0.113.7',
      user_agent: 'vitest',
    });
    expect(JSON.parse(audit!.details!)).toEqual({
      source: 'dashboard',
      changes: [
        { field: 'prefix', before: '!', after: '??' },
        { field: 'timezone', before: 'UTC', after: 'Asia/Tokyo' },
      ],
    });
  });

  it('applies a partial patch and records only the changed field', async () => {
    await service.update('g1', 'general', { timezone: 'Europe/London' }, dashboardActor);
    const { changes } = await service.update(
      'g1',
      'general',
      { prefix: '$' },
      { userId: 'cli', source: 'cli' },
    );
    expect(changes).toEqual([{ field: 'prefix', before: '!', after: '$' }]);
    expect(await service.get('g1', 'general')).toEqual({
      prefix: '$',
      timezone: 'Europe/London',
    });
  });

  it('writes nothing when the values are unchanged', async () => {
    const { changes } = await service.update('g1', 'general', { prefix: '!' }, dashboardActor);
    expect(changes).toEqual([]);
    expect(auditRows()).toEqual([]);
    expect(await versions.listChangedSince(new Date(0))).toEqual([]);
  });

  it('rejects invalid values with field errors and writes nothing', async () => {
    const error = await service
      .update('g1', 'general', { prefix: '@x', timezone: 'GMT+8' }, dashboardActor)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GuildConfigValidationError);
    const { fieldErrors } = error as GuildConfigValidationError;
    expect(fieldErrors.prefix?.[0]).toContain('`@` or `#`');
    expect(fieldErrors.timezone?.[0]).toContain('not a valid IANA timezone');
    expect(auditRows()).toEqual([]);
    expect(await service.get('g1', 'general')).toEqual({ prefix: '!', timezone: 'UTC' });
  });

  it('rejects keys the module does not have', async () => {
    await expect(
      service.update('g1', 'general', { locale: 'fr-FR' }, dashboardActor),
    ).rejects.toBeInstanceOf(GuildConfigValidationError);
  });
});

describe('diffFields', () => {
  it('compares nested values by content', () => {
    expect(
      diffFields({ roles: ['a'], limit: 1, same: 'x' }, { roles: ['a', 'b'], limit: 1, same: 'x' }),
    ).toEqual([{ field: 'roles', before: ['a'], after: ['a', 'b'] }]);
  });
});
