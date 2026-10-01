import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CommandSettingsRepository,
  createDatabaseClient,
  GuildSettingsRepository,
  type SqliteDatabaseClient,
} from '@ririko/database';
import { EventBus } from '@ririko/core';
import { CommandOverrideService } from '../command-override.service.js';
import { GuildSettingsService } from '../guild-settings.service.js';
import { ModuleToggleService, EXEMPT_MODULE_CATEGORIES } from '../module-toggle.service.js';

describe('ModuleToggleService (TASK-1753)', () => {
  let db: SqliteDatabaseClient;
  let commandRepo: CommandSettingsRepository;
  let guildSettingsRepo: GuildSettingsRepository;
  let overrideService: CommandOverrideService;
  let guildSettingsService: GuildSettingsService;
  let eventBus: EventBus;
  let service: ModuleToggleService;

  const overrideRow = (commandName: string, isEnabled: boolean) => ({
    commandName,
    channelId: null,
    isEnabled,
    cooldownOverride: null,
    allowedRoles: [],
    blockedRoles: [],
  });

  beforeEach(async () => {
    const raw = await createDatabaseClient({
      dialect: 'sqlite',
      url: ':memory:',
      autoMigrate: true,
    });
    if (raw.dialect !== 'sqlite') throw new Error('Expected sqlite client');
    db = raw;
    commandRepo = new CommandSettingsRepository(db);
    guildSettingsRepo = new GuildSettingsRepository(db);
    overrideService = new CommandOverrideService({ repo: commandRepo, cacheTtlMs: 1000 });
    guildSettingsService = new GuildSettingsService({ repo: guildSettingsRepo });
    eventBus = new EventBus();

    service = new ModuleToggleService({
      commandOverrideService: overrideService,
      guildSettingsService,
      eventBus,
    });
  });

  afterEach(async () => {
    await db.close();
  });

  it('always enables exempt categories (general, admin, utility)', async () => {
    for (const cat of EXEMPT_MODULE_CATEGORIES) {
      expect(await service.isModuleEnabled('g1', cat)).toBe(true);
    }

    // Even if an explicit override attempts to disable it
    service.setModuleEnabled('g1', 'general', false);
    service.setModuleEnabled('g1', 'admin', false);
    service.setModuleEnabled('g1', 'utility', false);

    expect(await service.isModuleEnabled('g1', 'general')).toBe(true);
    expect(await service.isModuleEnabled('g1', 'admin')).toBe(true);
    expect(await service.isModuleEnabled('g1', 'utility')).toBe(true);
  });

  it('defaults non-exempt categories to enabled', async () => {
    expect(await service.isModuleEnabled('g1', 'music')).toBe(true);
    expect(await service.isModuleEnabled('g1', 'ai')).toBe(true);
    expect(await service.isModuleEnabled('g1', 'tcg')).toBe(true);
    expect(await service.isModuleEnabled('g1', 'economy')).toBe(true);
    expect(await service.isModuleEnabled('g1', 'games')).toBe(true);
  });

  it('respects in-memory explicit overrides and invalidates properly', async () => {
    expect(await service.isModuleEnabled('g1', 'music')).toBe(true);

    service.setModuleEnabled('g1', 'music', false);
    expect(await service.isModuleEnabled('g1', 'music')).toBe(false);
    expect(await service.isModuleEnabled('g1', 'MUSIC')).toBe(false);

    // Other categories unaffected
    expect(await service.isModuleEnabled('g1', 'ai')).toBe(true);

    // Invalidation clears in-memory state
    service.invalidate('g1');
    expect(await service.isModuleEnabled('g1', 'music')).toBe(true);
  });

  it('respects database command_settings for category and module overrides', async () => {
    // 1. Prefix with category:
    await commandRepo.replaceForGuild('g1', [overrideRow('category:music', false)]);
    overrideService.invalidate('g1');
    expect(await service.isModuleEnabled('g1', 'music')).toBe(false);

    // 2. Prefix with module:
    await commandRepo.replaceForGuild('g1', [overrideRow('module:ai', false)]);
    overrideService.invalidate('g1');
    expect(await service.isModuleEnabled('g1', 'ai')).toBe(false);

    // 3. Direct category name:
    await commandRepo.replaceForGuild('g1', [overrideRow('tcg', false)]);
    overrideService.invalidate('g1');
    expect(await service.isModuleEnabled('g1', 'tcg')).toBe(false);

    // Unrelated module is still enabled
    expect(await service.isModuleEnabled('g1', 'economy')).toBe(true);
  });

  it('checks guild settings heuristics for games wager disablement', async () => {
    expect(await service.isModuleEnabled('g1', 'games')).toBe(true);

    await guildSettingsRepo.upsert({
      guildId: 'g1',
      maxGameWager: 0,
    });
    guildSettingsService.invalidate('g1');

    expect(await service.isModuleEnabled('g1', 'games')).toBe(false);
  });

  it('invalidates overrides upon eventBus guild:configChanged event', async () => {
    service.setModuleEnabled('g1', 'music', false);
    expect(await service.isModuleEnabled('g1', 'music')).toBe(false);

    await eventBus.emitAsync('guild:configChanged', {
      guildId: 'g1',
      module: 'commands',
      version: 1,
    });

    expect(await service.isModuleEnabled('g1', 'music')).toBe(true);
  });
});
