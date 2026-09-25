import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EventBus, type CoreEvents } from '@ririko/core';
import {
  createDatabaseClient,
  GuildConfigVersionRepository,
  type DatabaseClient,
} from '@ririko/database';
import { GuildConfigWatcher } from '../guild-config-watcher.js';

const T0 = Date.UTC(2026, 8, 25);

describe('GuildConfigWatcher (CHORE-1101)', () => {
  let db: DatabaseClient;
  let repo: GuildConfigVersionRepository;
  let now: number;
  let events: CoreEvents['guild:configChanged'][];
  let watcher: GuildConfigWatcher;

  beforeEach(async () => {
    db = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:', autoMigrate: true });
    repo = new GuildConfigVersionRepository(db);
    now = T0;
    events = [];
    const bus = new EventBus();
    bus.on('guild:configChanged', (event) => {
      events.push(event);
    });
    watcher = new GuildConfigWatcher(repo, bus, { overlapMs: 60_000, now: () => now });
  });

  afterEach(async () => {
    watcher.stop();
    await db.close();
  });

  it('emits each new version once', async () => {
    await repo.bump('g1', 'general', new Date(T0 + 1_000));
    await repo.bump('g2', 'music', new Date(T0 + 2_000));

    expect(await watcher.tick()).toBe(2);
    expect(events).toEqual([
      { guildId: 'g1', module: 'general', version: 1 },
      { guildId: 'g2', module: 'music', version: 1 },
    ]);
    expect(await watcher.tick()).toBe(0);
  });

  it('catches a second write stamped in the same millisecond', async () => {
    const stamp = new Date(T0 + 1_000);
    await repo.bump('g1', 'general', stamp);
    await watcher.tick();
    await repo.bump('g1', 'general', stamp);

    expect(await watcher.tick()).toBe(1);
    expect(events.at(-1)).toEqual({ guildId: 'g1', module: 'general', version: 2 });
  });

  it('catches a write committed after a newer one within the overlap window', async () => {
    await repo.bump('g1', 'general', new Date(T0 + 30_000));
    await watcher.tick();
    // Another writer with a slower clock commits later but stamps an earlier time.
    await repo.bump('g2', 'general', new Date(T0 + 5_000));

    expect(await watcher.tick()).toBe(1);
    expect(events.at(-1)?.guildId).toBe('g2');
  });

  it('ignores changes made before the bot started beyond the overlap window', async () => {
    await repo.bump('g1', 'general', new Date(T0 - 120_000));
    expect(await watcher.tick()).toBe(0);
  });
});
