import { afterEach, describe, expect, it } from 'vitest';
import {
  createDatabaseClient,
  GuildConfigVersionRepository,
  GuildSettingsRepository,
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
});
