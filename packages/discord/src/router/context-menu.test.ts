import { describe, expect, it, vi } from 'vitest';
import { PermissionFlagsBits, type REST } from 'discord.js';
import { CommandRegistry } from './registry.js';
import { CommandCategory, type Command } from '../command/types.js';
import { CommandSynchronizer } from '../rest/sync.js';
import { HelpGenerator } from '../help/generator.js';

function command(name = 'translate', menuName = 'Translate to English'): Command {
  return {
    metadata: {
      name,
      messageContextMenuName: menuName,
      category: CommandCategory.AI,
      description: 'Translate privately.',
      slashEnabled: false,
      prefixEnabled: false,
    },
    execute: vi.fn(),
  };
}

describe('Message context menu registration', () => {
  it('resolves menu names separately from slash names and aliases and removes them on unregister', () => {
    const registry = new CommandRegistry();
    const translation = command();
    registry.register(translation);
    expect(registry.get('translate')).toBe(translation);
    expect(registry.getMessageContextMenu('Translate to English')).toBe(translation);
    expect(registry.getMessageContextMenu('translate')).toBeUndefined();
    registry.unregister('translate');
    expect(registry.getMessageContextMenu('Translate to English')).toBeUndefined();
    registry.register(translation);
    registry.clear();
    expect(registry.getMessageContextMenu('Translate to English')).toBeUndefined();
  });

  it('rejects duplicate menu names without registering the second command', () => {
    const registry = new CommandRegistry().register(command());
    expect(() => registry.register(command('other'))).toThrow('unique');
    expect(registry.has('other')).toBe(false);
  });

  it.each(['', ' ', 'x'.repeat(33)])('rejects invalid display names (%#)', (name) => {
    const registry = new CommandRegistry();
    expect(() => registry.register(command('translate', name))).toThrow('1–32');
    expect(registry.size).toBe(0);
  });

  it('registers menus with the global scope only', async () => {
    const translation = command();
    translation.metadata.isGuildOnly = true;
    translation.metadata.userPermissions = [PermissionFlagsBits.ManageMessages];
    const registry = new CommandRegistry()
      .register(translation)
      .register({
        metadata: { name: 'ping', description: 'Ping', category: CommandCategory.GENERAL },
        execute: vi.fn(),
      })
      .register({
        metadata: {
          name: 'ban',
          description: 'Ban',
          category: CommandCategory.MODERATION,
          registrationScope: 'guild',
        },
        execute: vi.fn(),
      });
    const put = vi.fn().mockResolvedValue([]);
    const sync = new CommandSynchronizer({ put } as unknown as REST, registry);

    expect((await sync.syncGlobal('app')).registeredCount).toBe(2);
    expect(put).toHaveBeenLastCalledWith('/applications/app/commands', {
      body: [
        { name: 'ping', description: 'Ping' },
        {
          name: 'Translate to English',
          type: 3,
          dm_permission: false,
          default_member_permissions: PermissionFlagsBits.ManageMessages.toString(),
        },
      ],
    });

    expect((await sync.syncGuild('app', 'server')).commandNames).toEqual(['ban']);
    expect(put).toHaveBeenLastCalledWith('/applications/app/guilds/server/commands', {
      body: [{ name: 'ban', description: 'Ban' }],
    });
  });

  it('shows right-click syntax in help without suggesting a nonexistent slash command', () => {
    const translation = command();
    const registry = new CommandRegistry().register(translation);
    const detail = HelpGenerator.generateCommandDetailView(translation).embed.toJSON();
    expect(detail.title).toContain('Translate to English');
    expect(detail.fields?.find((f) => f.name === 'Syntax')?.value).toContain(
      'Right-click → Apps → Translate to English',
    );
    expect(JSON.stringify(detail)).not.toContain('/translate');
    const category = HelpGenerator.generateCategoryView(
      registry,
      CommandCategory.AI,
    ).embed.toJSON();
    expect(category.fields?.[0]?.name).toBe('Apps → Translate to English');
  });
});
