import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AuditLogRepository,
  CommandCatalogRepository,
  CommandSettingsRepository,
  createDatabaseClient,
  GuildConfigVersionRepository,
  GuildSettingsRepository,
  ModerationRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import { DEFAULT_ESCALATION_STEPS } from '@ririko/core';
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
  let moderation: ModerationRepository;
  let commandSettings: CommandSettingsRepository;
  let commandCatalog: CommandCatalogRepository;
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
    moderation = new ModerationRepository(db);
    commandSettings = new CommandSettingsRepository(db);
    commandCatalog = new CommandCatalogRepository(db);
    service = new GuildConfigService({
      db,
      guildSettings: new GuildSettingsRepository(db),
      moderation,
      commandSettings,
      commandCatalog,
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

  describe('logging (TASK-1141)', () => {
    it('sets and clears the log channel', async () => {
      expect(await service.get('g1', 'logging')).toEqual({ logChannelId: null });
      await service.update('g1', 'logging', { logChannelId: '123456789012345678' }, dashboardActor);
      expect(await service.get('g1', 'logging')).toEqual({ logChannelId: '123456789012345678' });
      const { changes } = await service.update(
        'g1',
        'logging',
        { logChannelId: '' },
        dashboardActor,
      );
      expect(changes).toEqual([
        { field: 'logChannelId', before: '123456789012345678', after: null },
      ]);
      expect(await service.get('g1', 'logging')).toEqual({ logChannelId: null });
    });

    it('keeps the other guild settings when the log channel changes', async () => {
      await service.update('g1', 'general', { prefix: '$' }, dashboardActor);
      await service.update('g1', 'logging', { logChannelId: '123456789012345678' }, dashboardActor);
      expect(await service.get('g1', 'general')).toEqual({ prefix: '$', timezone: 'UTC' });
    });
  });

  describe('moderation (TASK-1142)', () => {
    it('returns the default policy until one is saved', async () => {
      expect(await service.get('g1', 'moderation')).toEqual({
        escalationSteps: DEFAULT_ESCALATION_STEPS,
      });
    });

    it('saves a sorted policy from JSON text, and an empty policy turns escalation off', async () => {
      await service.update(
        'g1',
        'moderation',
        {
          escalationSteps:
            '[{"warnThreshold":4,"action":"BAN"},{"warnThreshold":2,"action":"TIMEOUT","durationSeconds":900}]',
        },
        { userId: 'cli', source: 'cli' },
      );
      expect(await service.get('g1', 'moderation')).toEqual({
        escalationSteps: [
          { warnThreshold: 2, action: 'TIMEOUT', durationSeconds: 900 },
          { warnThreshold: 4, action: 'BAN' },
        ],
      });

      await service.update('g1', 'moderation', { escalationSteps: [] }, dashboardActor);
      expect(await service.get('g1', 'moderation')).toEqual({ escalationSteps: [] });
    });

    it('reports errors with the row they belong to', async () => {
      const error = await service
        .update(
          'g1',
          'moderation',
          {
            escalationSteps: [
              { warnThreshold: 1, action: 'WARN' },
              { warnThreshold: 2, action: 'TIMEOUT' },
            ],
          },
          dashboardActor,
        )
        .catch((e: unknown) => e);
      expect((error as GuildConfigValidationError).fieldErrors).toEqual({
        escalationSteps: ['Row 2: Timeout steps need a length.'],
      });
    });
  });

  describe('automod (TASK-1142)', () => {
    it('reads the rule defaults when no rows exist', async () => {
      expect(await service.get('g1', 'automod')).toEqual({
        inviteFilterEnabled: true,
        inviteFilterAction: 'DELETE',
        inviteFilterExemptRoleIds: [],
        inviteFilterExemptChannelIds: [],
        phishingShieldEnabled: true,
        phishingShieldAction: 'DELETE',
        phishingShieldExemptRoleIds: [],
        phishingShieldExemptChannelIds: [],
        mentionSpamEnabled: true,
        mentionSpamAction: 'DELETE',
        mentionSpamExemptRoleIds: [],
        mentionSpamExemptChannelIds: [],
        mentionSpamLimit: 5,
        burstSpamEnabled: true,
        burstSpamAction: 'DELETE',
        burstSpamExemptRoleIds: [],
        burstSpamExemptChannelIds: [],
        burstSpamLimit: 5,
      });
    });

    it('shows what the bot runs for rows the automod command created', async () => {
      await moderation.upsertRule({ guildId: 'g1', ruleType: 'MENTION_SPAM', isEnabled: false });
      await moderation.upsertRule({ guildId: 'g1', ruleType: 'BURST_SPAM', action: 'ALLOW' });
      expect(await service.get('g1', 'automod')).toMatchObject({
        mentionSpamEnabled: false,
        mentionSpamAction: 'WARN',
        mentionSpamLimit: 3,
        burstSpamAction: 'DELETE',
      });
    });

    it('writes each rule to moderation_rules and keeps thresholds the bot does not read', async () => {
      await moderation.upsertRule({ guildId: 'g1', ruleType: 'INVITE_FILTER', threshold: 7 });
      await service.update(
        'g1',
        'automod',
        {
          inviteFilterEnabled: 'off',
          mentionSpamAction: 'TIMEOUT',
          mentionSpamLimit: '12',
          burstSpamExemptChannelIds: '123456789012345678,223456789012345678',
        },
        { userId: 'cli', source: 'cli' },
      );

      const rules = await moderation.getRules('g1');
      expect(rules).toHaveLength(4);
      expect(rules.find((rule) => rule.ruleType === 'INVITE_FILTER')).toMatchObject({
        isEnabled: false,
        action: 'WARN',
        threshold: 7,
      });
      expect(rules.find((rule) => rule.ruleType === 'MENTION_SPAM')).toMatchObject({
        action: 'TIMEOUT',
        threshold: 12,
      });
      expect(rules.find((rule) => rule.ruleType === 'BURST_SPAM')).toMatchObject({
        exemptChannels: ['123456789012345678', '223456789012345678'],
      });
      expect((await versions.listChangedSince(new Date(0)))[0]).toMatchObject({
        module: 'automod',
      });
    });

    it('rejects out-of-range limits and unknown actions', async () => {
      const error = await service
        .update('g1', 'automod', { mentionSpamLimit: 0, burstSpamAction: 'ALLOW' }, dashboardActor)
        .catch((e: unknown) => e);
      expect(Object.keys((error as GuildConfigValidationError).fieldErrors)).toEqual([
        'mentionSpamLimit',
        'burstSpamAction',
      ]);
      expect(await moderation.getRules('g1')).toEqual([]);
    });
  });

  describe('commands (TASK-1631)', () => {
    const CHANNEL = '123456789012345678';
    const ROLE = '223456789012345678';
    const catalogEntry = (name: string, category: string) => ({
      name,
      category,
      description: name,
      slashEnabled: true,
      prefixEnabled: true,
      defaultPermission: null,
      cooldownSeconds: 0,
    });

    beforeEach(async () => {
      await commandCatalog.replaceAll([
        catalogEntry('rps', 'games'),
        catalogEntry('play', 'music'),
      ]);
    });

    it('reads no overrides for a new guild', async () => {
      expect(await service.get('g1', 'commands')).toEqual({ overrides: [] });
    });

    it('replaces the rows, bumps the feed and audits the change', async () => {
      await service.update(
        'g1',
        'commands',
        {
          overrides: JSON.stringify([
            { command: 'rps', channelId: CHANNEL, blockedRoleIds: [ROLE] },
            { command: 'rps', enabled: false },
            { command: 'play', cooldownSeconds: 30 },
          ]),
        },
        { userId: 'cli', source: 'cli' },
      );

      const { overrides } = await service.get('g1', 'commands');
      expect(overrides.map((row) => [row.command, row.channelId])).toEqual([
        ['play', null],
        ['rps', null],
        ['rps', CHANNEL],
      ]);
      expect(await commandSettings.listForGuild('g1')).toHaveLength(3);
      expect((await versions.listChangedSince(new Date(0)))[0]).toMatchObject({
        module: 'commands',
      });
      expect(auditRows()[0]?.action).toBe('guild_config.commands.update');

      // Saving the same rows in another order changes nothing.
      const again = await service.update(
        'g1',
        'commands',
        { overrides: [...overrides].reverse() },
        dashboardActor,
      );
      expect(again.changes).toEqual([]);
    });

    it('rejects commands the bot did not record and writes nothing', async () => {
      const error = await service
        .update(
          'g1',
          'commands',
          { overrides: [{ command: 'nope', enabled: false }] },
          dashboardActor,
        )
        .catch((e: unknown) => e);
      expect((error as GuildConfigValidationError).fieldErrors).toEqual({
        overrides: ['Unknown command: `nope`.'],
      });
      expect(await commandSettings.listForGuild('g1')).toEqual([]);
      expect(await versions.listChangedSince(new Date(0))).toEqual([]);
    });

    it('explains an empty catalog', async () => {
      await commandCatalog.replaceAll([]);
      const error = await service
        .update(
          'g1',
          'commands',
          { overrides: [{ command: 'rps', enabled: false }] },
          dashboardActor,
        )
        .catch((e: unknown) => e);
      expect((error as GuildConfigValidationError).fieldErrors.overrides?.[0]).toMatch(
        /Start the bot once/,
      );
    });

    it('keeps row numbers in schema errors', async () => {
      const error = await service
        .update(
          'g1',
          'commands',
          {
            overrides: [
              { command: 'rps', enabled: false },
              { command: 'help', enabled: false },
            ],
          },
          dashboardActor,
        )
        .catch((e: unknown) => e);
      expect((error as GuildConfigValidationError).fieldErrors).toEqual({
        overrides: ['Row 2: `help` is always available and cannot be overridden.'],
      });
    });
  });
});

describe('diffFields', () => {
  it('compares nested values by content', () => {
    expect(
      diffFields({ roles: ['a'], limit: 1, same: 'x' }, { roles: ['a', 'b'], limit: 1, same: 'x' }),
    ).toEqual([{ field: 'roles', before: ['a'], after: ['a', 'b'] }]);
  });
});
