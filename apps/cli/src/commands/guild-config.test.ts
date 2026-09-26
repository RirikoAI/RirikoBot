import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ValidationError } from '@ririko/core';
import {
  CommandCatalogRepository,
  createDatabaseClient,
  type SqliteDatabaseClient,
} from '@ririko/database';
import type { GuildConfigService } from '@ririko/services/guild';
import { createGuildConfigService, listConfigKeys, runGuildConfig } from './guild-config.js';

const GUILD = '100000000000000001';
// Strip terminal colours so assertions read plainly.
// eslint-disable-next-line no-control-regex
const plain = (lines: string[]) => lines.map((line) => line.replace(/\x1b\[[0-9;]*m/g, ''));

describe('ririko guild:config (TASK-1113)', () => {
  let db: SqliteDatabaseClient;
  let service: GuildConfigService;

  beforeEach(async () => {
    const raw = await createDatabaseClient({
      dialect: 'sqlite',
      url: ':memory:',
      autoMigrate: true,
    });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    db = raw;
    service = createGuildConfigService(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('exposes every key from the shared schemas', () => {
    const keys = listConfigKeys().map((entry) => entry.key);
    expect(keys.slice(0, 3)).toEqual([
      'general.prefix',
      'general.timezone',
      'moderation.escalationSteps',
    ]);
    expect(keys).toContain('automod.mentionSpamLimit');
    expect(keys).toContain('automod.burstSpamExemptRoleIds');
    expect(keys).toContain('logging.logChannelId');
    expect(keys.at(-1)).toBe('commands.overrides');
    expect(listConfigKeys().every((entry) => entry.description.length > 0)).toBe(true);
  });

  it('round-trips flags, numbers, ID lists, rows and cleared channels as text (TASK-1141)', async () => {
    await runGuildConfig(service, GUILD, 'automod.inviteFilterEnabled', 'off');
    await runGuildConfig(service, GUILD, 'automod.mentionSpamLimit', '8');
    await runGuildConfig(
      service,
      GUILD,
      'automod.burstSpamExemptRoleIds',
      '200000000000000001, 200000000000000002',
    );
    await runGuildConfig(
      service,
      GUILD,
      'moderation.escalationSteps',
      '[{"warnThreshold":2,"action":"KICK"}]',
    );
    expect(await runGuildConfig(service, GUILD, 'automod.inviteFilterEnabled')).toEqual(['false']);
    expect(await runGuildConfig(service, GUILD, 'automod.mentionSpamLimit')).toEqual(['8']);
    expect(await runGuildConfig(service, GUILD, 'automod.burstSpamExemptRoleIds')).toEqual([
      '200000000000000001,200000000000000002',
    ]);
    expect(await runGuildConfig(service, GUILD, 'moderation.escalationSteps')).toEqual([
      '[{"warnThreshold":2,"action":"KICK"}]',
    ]);

    const set = plain(
      await runGuildConfig(service, GUILD, 'logging.logChannelId', '300000000000000001'),
    );
    expect(set).toEqual(['✔ logging.logChannelId: (none) → 300000000000000001']);
    await runGuildConfig(service, GUILD, 'logging.logChannelId', '');
    expect(await runGuildConfig(service, GUILD, 'logging.logChannelId')).toEqual(['']);

    await expect(runGuildConfig(service, GUILD, 'automod.mentionSpamLimit', '99')).rejects.toThrow(
      /Invalid value for automod\.mentionSpamLimit: Enter a whole number from 1 to 50\./,
    );
    await expect(
      runGuildConfig(
        service,
        GUILD,
        'moderation.escalationSteps',
        '[{"warnThreshold":2,"action":"TIMEOUT"}]',
      ),
    ).rejects.toThrow(/Row 1: Timeout steps need a length\./);
  });

  it('round-trips command overrides as JSON and rejects unknown commands (TASK-1632)', async () => {
    await new CommandCatalogRepository(db).replaceAll([
      {
        name: 'rps',
        category: 'games',
        description: 'Rock paper scissors',
        slashEnabled: true,
        prefixEnabled: true,
        defaultPermission: null,
        cooldownSeconds: 3,
      },
    ]);
    const rows =
      '[{"command":"rps","channelId":null,"enabled":false,"allowedRoleIds":[],"blockedRoleIds":[],"cooldownSeconds":null}]';
    await runGuildConfig(service, GUILD, 'commands.overrides', rows);
    expect(await runGuildConfig(service, GUILD, 'commands.overrides')).toEqual([rows]);

    await runGuildConfig(service, GUILD, 'commands.overrides', '[]');
    expect(await runGuildConfig(service, GUILD, 'commands.overrides')).toEqual(['[]']);
    await runGuildConfig(service, GUILD, 'moderation.escalationSteps', '[]');
    expect(await runGuildConfig(service, GUILD, 'moderation.escalationSteps')).toEqual(['[]']);
    expect(await runGuildConfig(service, GUILD, 'automod.burstSpamExemptRoleIds')).toEqual(['[]']);
    await runGuildConfig(service, GUILD, 'automod.burstSpamExemptRoleIds', '[]');

    await expect(
      runGuildConfig(service, GUILD, 'commands.overrides', '[{"command":"nope","enabled":false}]'),
    ).rejects.toThrow(/Unknown command: `nope`\./);
  });

  it('lists all settings with their current values', async () => {
    const lines = plain(await runGuildConfig(service, GUILD));
    expect(lines[0]).toBe(`Settings for guild ${GUILD}`);
    expect(lines[1]).toMatch(/^ {2}general\.prefix +! +Prefix for text commands/);
    expect(lines[2]).toMatch(/^ {2}general\.timezone +UTC /);
  });

  it('sets a value through the service and prints only the value on read', async () => {
    const set = plain(await runGuildConfig(service, GUILD, 'general.timezone', 'asia/tokyo'));
    expect(set).toEqual(['✔ general.timezone: UTC → Asia/Tokyo']);
    expect(await runGuildConfig(service, GUILD, 'general.timezone')).toEqual(['Asia/Tokyo']);

    const again = await runGuildConfig(service, GUILD, 'general.timezone', 'Asia/Tokyo');
    expect(again).toEqual(['general.timezone is already Asia/Tokyo; nothing changed.']);
  });

  it('records a CLI audit entry', async () => {
    await runGuildConfig(service, GUILD, 'general.prefix', '?');
    const row = db.raw.prepare('SELECT actor_user_id, details FROM audit_logs').get() as {
      actor_user_id: string;
      details: string;
    };
    expect(row.actor_user_id).toMatch(/^cli/);
    expect(JSON.parse(row.details)).toMatchObject({ source: 'cli' });
  });

  it('rejects invalid values, unknown keys and malformed guild IDs', async () => {
    await expect(runGuildConfig(service, GUILD, 'general.prefix', '@bad')).rejects.toThrow(
      /Invalid value for general\.prefix: .*`@` or `#`/,
    );
    await expect(runGuildConfig(service, GUILD, 'general.locale', 'en-US')).rejects.toThrow(
      ValidationError,
    );
    await expect(runGuildConfig(service, GUILD, 'toString.x')).rejects.toThrow(ValidationError);
    await expect(runGuildConfig(service, 'not-a-guild')).rejects.toThrow(/not a Discord guild ID/);
    expect(await runGuildConfig(service, GUILD, 'general.prefix')).toEqual(['!']);
  });
});
