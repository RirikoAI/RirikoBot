import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CommandRegistry } from '../packages/discord/src/index.js';
import { createDatabaseClient, type DatabaseClient } from '../packages/database/src/index.js';
import { createCommandControllers, registerBotCommands } from '../apps/bot/src/command-set.js';
import { createBot } from '../apps/bot/src/index.js';
import { createBotServices } from '../apps/bot/src/services.js';
import {
  buildCommandCatalog,
  exportCommands,
  isDocumented,
  type CommandCatalog,
} from './export-commands.js';

describe('command catalog export (TASK-1892)', () => {
  let dir: string;
  let db: DatabaseClient;
  let close: () => Promise<void>;
  const registry = new CommandRegistry();
  let catalog: CommandCatalog;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'ririko-commands-'));
    const output = join(dir, 'commands.json');
    await exportCommands(output);
    catalog = JSON.parse(readFileSync(output, 'utf8')) as CommandCatalog;

    // The reference set is built straight from createCommandControllers + registerBotCommands.
    db = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:', autoMigrate: true });
    const { client } = createBot();
    const services = await createBotServices(db, client);
    registerBotCommands(registry, {
      services,
      controllers: createCommandControllers(client, services, '!'),
      helpOptions: { defaultPrefix: '!' },
      prefix: '!',
      version: '',
    });
    close = async () => {
      await client.destroy();
      await db.close();
    };
  });

  afterAll(async () => {
    await close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('lists exactly the documented commands the bot registers', () => {
    const expected = registry
      .getAll()
      .filter(isDocumented)
      .map((command) => command.metadata.name)
      .sort();
    expect(expected.length).toBeGreaterThan(100);
    expect(catalog.commands.map((command) => command.name).sort()).toEqual(expected);
  });

  it('copies category, description, aliases, options and permissions from the definitions', () => {
    for (const entry of catalog.commands) {
      const { metadata } = registry.get(entry.name)!;
      expect(entry.category).toBe(metadata.category);
      expect(entry.description).toBe(metadata.description);
      expect(entry.aliases).toEqual(metadata.aliases ?? []);
      expect(entry.options.map((option) => option.name)).toEqual(
        (metadata.options ?? []).map((option) => option.name),
      );
      expect(entry.permissions.length > 0).toBe((metadata.userPermissions ?? []).length > 0);
    }
  });

  it('leaves hidden and owner-only commands out', () => {
    const hidden = registry
      .getAll()
      .filter((command) => !isDocumented(command))
      .map((command) => command.metadata.name);
    for (const name of hidden) {
      expect(catalog.commands.some((command) => command.name === name)).toBe(false);
    }
  });

  it('lists a category only when it has commands, and every command has a category entry', () => {
    const ids = catalog.categories.map((category) => category.id);
    expect(new Set(catalog.commands.map((command) => command.category))).toEqual(new Set(ids));
  });

  it('sorts by category then name and carries the prefix', () => {
    const sorted = [...catalog.commands].sort(
      (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
    );
    expect(catalog.commands).toEqual(sorted);
    expect(catalog.prefix).toBe('!');
  });

  it('buildCommandCatalog is pure over a command list', () => {
    const rebuilt = buildCommandCatalog(registry.getAll(), '!');
    expect(rebuilt).toEqual(catalog);
  });
});
