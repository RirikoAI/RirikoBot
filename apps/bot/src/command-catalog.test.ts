import { afterEach, describe, expect, it, vi } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';
import {
  CommandCatalogRepository,
  createDatabaseClient,
  type DatabaseClient,
} from '@ririko/database';
import { CommandCategory, type Command } from '@ririko/discord';
import { syncCommandCatalog, toCatalogEntries } from './command-catalog.js';

const command = (metadata: Partial<Command['metadata']> & { name: string }): Command => ({
  metadata: { category: CommandCategory.GAMES, description: metadata.name, ...metadata },
  execute: vi.fn(),
});

describe('command catalog (TASK-1631)', () => {
  let db: DatabaseClient | undefined;

  afterEach(async () => {
    await db?.close();
  });

  it('lists what guilds can override, with permissions and cooldowns', () => {
    const entries = toCatalogEntries([
      command({ name: 'rps', cooldownSeconds: 3 }),
      command({
        name: 'ban',
        category: CommandCategory.MODERATION,
        userPermissions: [PermissionFlagsBits.BanMembers],
        prefixEnabled: false,
      }),
      command({ name: 'secret', isHidden: true }),
      command({ name: 'eval', isOwnerOnly: true }),
    ]);
    expect(entries).toEqual([
      {
        name: 'rps',
        category: 'games',
        description: 'rps',
        slashEnabled: true,
        prefixEnabled: true,
        defaultPermission: null,
        cooldownSeconds: 3,
      },
      {
        name: 'ban',
        category: 'moderation',
        description: 'ban',
        slashEnabled: true,
        prefixEnabled: false,
        defaultPermission: 'BanMembers',
        cooldownSeconds: 0,
      },
    ]);
  });

  it('writes the catalog and logs instead of throwing on failure', async () => {
    db = await createDatabaseClient({ dialect: 'sqlite', url: ':memory:', autoMigrate: true });
    const repo = new CommandCatalogRepository(db);
    await syncCommandCatalog([command({ name: 'rps' })], repo);
    expect((await repo.list()).map((row) => row.name)).toEqual(['rps']);

    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(repo, 'replaceAll').mockRejectedValue(new Error('disk full'));
    await expect(syncCommandCatalog([], repo)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
