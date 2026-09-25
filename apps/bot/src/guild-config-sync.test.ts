import { afterEach, describe, expect, it } from 'vitest';
import {
  createDatabaseClient,
  GuildConfigVersionRepository,
  GuildSettingsRepository,
  ModerationRepository,
  type DatabaseClient,
} from '@ririko/database';
import { createBotServices } from './services.js';

describe('guild config changes from other processes (CHORE-1101)', () => {
  let db: DatabaseClient | undefined;

  afterEach(async () => {
    await db?.close();
  });

  it('drops the cached prefix once the change feed reports a dashboard write', async () => {
    db = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:', autoMigrate: true });
    const services = await createBotServices(db);
    await services.guildSettingsService.setPrefix('guild-1', '!');

    // What the dashboard does in its own process: write the setting and bump the feed.
    await new GuildSettingsRepository(db).upsert({ guildId: 'guild-1', prefix: '?' });
    await new GuildConfigVersionRepository(db).bump('guild-1', 'general', new Date());

    expect(await services.guildSettingsService.getPrefix('guild-1')).toBe('!');
    await services.guildConfigWatcher.tick();
    expect(await services.guildSettingsService.getPrefix('guild-1')).toBe('?');
  });

  it('drops the cached AutoMod rules once the change feed reports an automod write (TASK-1142)', async () => {
    db = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:', autoMigrate: true });
    const services = await createBotServices(db);
    const mentionSpam = async () =>
      (await services.autoModService.getGuildRuleConfigs('guild-1')).get('MENTION_SPAM');
    expect(await mentionSpam()).toMatchObject({ isEnabled: true, threshold: 5 });

    // What GuildConfigService does for the dashboard: write the rule and bump the feed.
    await new ModerationRepository(db).upsertRule({
      guildId: 'guild-1',
      ruleType: 'MENTION_SPAM',
      isEnabled: false,
      threshold: 9,
    });
    await new GuildConfigVersionRepository(db).bump('guild-1', 'automod', new Date());

    expect(await mentionSpam()).toMatchObject({ isEnabled: true });
    await services.guildConfigWatcher.tick();
    expect(await mentionSpam()).toMatchObject({ isEnabled: false, threshold: 9 });
  });
});
