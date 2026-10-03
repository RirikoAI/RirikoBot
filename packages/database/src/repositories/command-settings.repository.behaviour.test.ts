import { expect, it } from 'vitest';
import { describeDialects } from '../testing/dialects.js';
import { CommandCatalogRepository } from './command-catalog.repository.js';
import { CommandSettingsRepository } from './command-settings.repository.js';

const override = (commandName: string, channelId: string | null = null) => ({
  commandName,
  channelId,
  isEnabled: false,
  cooldownOverride: null,
  allowedRoles: [],
  blockedRoles: ['role-1'],
});

const entry = (name: string, category: string, cooldownSeconds = 3) => ({
  name,
  category,
  description: `${name} command`,
  slashEnabled: true,
  prefixEnabled: true,
  defaultPermission: null,
  cooldownSeconds,
});

describeDialects('CommandSettingsRepository behaviour', (db) => {
  it('replaces the overrides of one guild, leaving other guilds alone', async () => {
    const repo = new CommandSettingsRepository(db.client);
    expect(await repo.listForGuild('g1')).toEqual([]);

    await repo.replaceForGuild('g1', [override('rps'), override('play')]);
    await repo.replaceForGuild('g2', [override('rps')]);
    await repo.replaceForGuild('g1', [override('rps', 'c1'), override('rps')]);

    // NULL channels sort first on SQLite and last on Postgres, so compare without relying on it.
    const rows = (await repo.listForGuild('g1')).sort((a, b) =>
      (a.channelId ?? '').localeCompare(b.channelId ?? ''),
    );
    expect(rows.map((r) => [r.commandName, r.channelId])).toEqual([
      ['rps', null],
      ['rps', 'c1'],
    ]);
    expect(rows[0]).toMatchObject({ guildId: 'g1', isEnabled: false, blockedRoles: ['role-1'] });
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);
    expect(await repo.listForGuild('g2')).toHaveLength(1);
  });

  it('clears a guild with an empty list', async () => {
    const repo = new CommandSettingsRepository(db.client);
    await repo.replaceForGuild('g1', [override('rps')]);

    await repo.replaceForGuild('g1', []);

    expect(await repo.listForGuild('g1')).toEqual([]);
  });
});

describeDialects('CommandCatalogRepository behaviour', (db) => {
  it('lists the catalog by category then name', async () => {
    const repo = new CommandCatalogRepository(db.client);
    expect(await repo.list()).toEqual([]);

    await repo.replaceAll([
      entry('play', 'music'),
      entry('ban', 'moderation'),
      entry('skip', 'music'),
    ]);

    expect((await repo.list()).map((c) => c.name)).toEqual(['ban', 'play', 'skip']);
  });

  it('makes the catalog exactly the given entries', async () => {
    const repo = new CommandCatalogRepository(db.client);
    await repo.replaceAll([entry('play', 'music'), entry('ban', 'moderation')]);

    await repo.replaceAll([entry('play', 'music', 10), entry('kick', 'moderation')]);

    const catalog = await repo.list();
    expect(catalog.map((c) => c.name)).toEqual(['kick', 'play']);
    expect(catalog.find((c) => c.name === 'play')?.cooldownSeconds).toBe(10);

    await repo.replaceAll([]);
    expect(await repo.list()).toEqual([]);
  });
});
