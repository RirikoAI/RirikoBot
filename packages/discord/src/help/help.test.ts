import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';
import { CommandRegistry } from '../router/registry.js';
import { CommandCategory, type Command, type CommandContext } from '../command/types.js';
import { HelpGenerator } from './generator.js';
import { createHelpCommand } from './command.js';
import { handleHelpInteraction } from './handler.js';
import type { StringSelectMenuInteraction, ButtonInteraction } from 'discord.js';

describe('Interactive Help Center Subsystem (TASK-0331)', () => {
  let registry: CommandRegistry;

  const pingCmd: Command = {
    metadata: {
      name: 'ping',
      category: CommandCategory.GENERAL,
      description: 'Check bot latency',
      aliases: ['p', 'pong'],
      cooldownSeconds: 5,
      examples: ['/ping', '!ping'],
    },
    execute: vi.fn(),
  };

  const playCmd: Command = {
    metadata: {
      name: 'play',
      category: CommandCategory.MUSIC,
      description: 'Play a music track or playlist',
      aliases: ['p-music'],
      options: [
        { name: 'query', type: 'STRING', description: 'Track title or URL', required: true },
      ],
      userPermissions: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
      botPermissions: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
      rateLimit: { max: 3, windowSeconds: 10 },
      examples: ['/play query:YOASOBI', '!play "Idol"'],
    },
    execute: vi.fn(),
  };

  const hiddenCmd: Command = {
    metadata: {
      name: 'secret',
      category: CommandCategory.ADMIN,
      description: 'Hidden internal command',
      isHidden: true,
    },
    execute: vi.fn(),
  };

  beforeEach(() => {
    registry = new CommandRegistry();
    registry.registerAll([pingCmd, playCmd, hiddenCmd]);
  });

  describe('HelpGenerator.generateHomeView', () => {
    it('generates rich home embed and select menu omitting hidden commands', () => {
      const { embed, components } = HelpGenerator.generateHomeView(registry, {
        defaultPrefix: '!',
        dashboardUrl: 'https://ririko.ai/dashboard',
      });

      const data = embed.toJSON();
      expect(data.title).toContain('Interactive Help Center');
      expect(data.description).toContain('dual-dispatch parity');

      // Check fields: general and music should be present; admin only has hidden command so it should not appear
      const fieldNames = data.fields?.map((f) => f.name) ?? [];
      expect(fieldNames.some((f) => f.includes('Music & Audio'))).toBe(true);
      expect(fieldNames.some((f) => f.includes('General'))).toBe(true);
      expect(fieldNames.some((f) => f.includes('Administration'))).toBe(false);

      // Components
      expect(components.length).toBeGreaterThanOrEqual(1);
      const selectMenuRow = components[0]?.toJSON() as { components: { options: unknown[] }[] };
      expect(selectMenuRow.components[0]?.options.length).toBe(2); // music + general

      // URL buttons row
      const buttonRow = components[1]?.toJSON() as { components: { url?: string }[] };
      expect(buttonRow.components[0]?.url).toBe('https://ririko.ai/dashboard');
    });

    it('uses dynamic server prefix in description and footer when provided', () => {
      const { embed } = HelpGenerator.generateHomeView(registry, { defaultPrefix: '!' }, '$');
      const data = embed.toJSON();
      expect(data.description).toContain('`$`');
      expect(data.footer?.text).toContain('Prefix: $');
    });
  });

  describe('HelpGenerator.generateCategoryView', () => {
    it('generates paginated command list for a specific category', () => {
      const { embed, components } = HelpGenerator.generateCategoryView(
        registry,
        CommandCategory.MUSIC,
        1,
        { pageSize: 5 },
      );

      const data = embed.toJSON();
      expect(data.title).toContain('Music & Audio Commands');
      expect(data.fields?.some((f) => f.name.includes('/play'))).toBe(true);

      // Buttons
      const buttonRow = components[1]?.toJSON() as {
        components: { disabled?: boolean; custom_id?: string }[];
      };
      // On page 1 of 1: previous and next should both be disabled
      expect(buttonRow.components[0]?.disabled).toBe(true); // prev
      expect(buttonRow.components[1]?.custom_id).toBe('help:home'); // home
      expect(buttonRow.components[2]?.disabled).toBe(true); // next
    });

    it('uses dynamic server prefix for command syntax and footer', () => {
      const { embed } = HelpGenerator.generateCategoryView(
        registry,
        CommandCategory.MUSIC,
        1,
        { defaultPrefix: '!' },
        '$',
      );
      const data = embed.toJSON();
      const playField = data.fields?.find((f) => f.name.includes('/play'));
      expect(playField?.name).toBe('`/play` (Prefix: `$play`)');
      expect(playField?.value).toContain('*Aliases: `$p-music`*');
      expect(data.footer?.text).toContain('Prefix: $');
    });

    it('safely handles commands with 60+ aliases without exceeding Discord embed constraints', () => {
      const reactionAliases = Array.from({ length: 60 }, (_, i) => `alias${i + 1}`);
      const massiveAliasCmd: Command = {
        metadata: {
          name: 'react',
          category: CommandCategory.REACTIONS,
          description: 'Trigger an anime reaction GIF',
          aliases: reactionAliases,
        },
        execute: vi.fn(),
      };
      registry.register(massiveAliasCmd);

      const { embed } = HelpGenerator.generateCategoryView(
        registry,
        CommandCategory.REACTIONS,
        1,
        {},
        '$',
      );
      const data = embed.toJSON();
      const reactField = data.fields?.find((f) => f.name.includes('/react'));
      expect(reactField?.name).toBe('`/react` (Prefix: `$react`)');
      expect(reactField?.value).toContain('*Aliases: `$alias1`, `$alias2`');
      expect(reactField?.value).toContain('(+55 more)');
      expect(reactField?.name.length).toBeLessThanOrEqual(256);
      expect((reactField?.value ?? '').length).toBeLessThanOrEqual(1024);
    });

    it('displays prefix syntax for commands without aliases', () => {
      const noAliasCmd: Command = {
        metadata: {
          name: 'volume',
          category: CommandCategory.MUSIC,
          description: 'Adjust audio playback volume',
        },
        execute: vi.fn(),
      };
      registry.register(noAliasCmd);

      const { embed } = HelpGenerator.generateCategoryView(
        registry,
        CommandCategory.MUSIC,
        1,
        {},
        '?',
      );
      const data = embed.toJSON();
      const volField = data.fields?.find((f) => f.name.includes('/volume'));
      expect(volField?.name).toBe('`/volume` (Prefix: `?volume`)');
    });
  });

  describe('HelpGenerator.generateCommandDetailView', () => {
    it('generates deep inspector with syntax, permissions, cooldowns, and examples', () => {
      const { embed, components } = HelpGenerator.generateCommandDetailView(playCmd, {
        defaultPrefix: '!',
        dashboardUrl: 'https://ririko.ai/dashboard',
      });

      const data = embed.toJSON();
      expect(data.title).toBe('Command Inspector: /play');
      expect(data.description).toBe('Play a music track or playlist');

      const fields = data.fields ?? [];
      const syntaxField = fields.find((f) => f.name === 'Syntax');
      expect(syntaxField?.value).toContain('/play <query>');
      expect(syntaxField?.value).toContain('!play <query>');

      const permField = fields.find((f) => f.name === 'Required User Permissions');
      expect(permField?.value).toContain('Connect');

      const rateLimitField = fields.find((f) => f.name === 'Rate Limit');
      expect(rateLimitField?.value).toContain('3 uses per 10s');

      const argsField = fields.find((f) => f.name === 'Arguments');
      expect(argsField?.value).toContain('`query`');

      // Buttons include Home and Link
      const buttonRow = components[0]?.toJSON() as {
        components: { url?: string; custom_id?: string }[];
      };
      expect(buttonRow.components.some((b) => b.custom_id === 'help:home')).toBe(true);
      expect(buttonRow.components.some((b) => b.url?.includes('/modules/music'))).toBe(true);
    });

    it('formats examples, usage, subcommands, and syntax with dynamic server prefix instead of hardcoding !', () => {
      const cmdWithUsage: Command = {
        metadata: {
          name: 'prefix',
          category: CommandCategory.UTILITY,
          description: 'Set server prefix',
          usage: '/prefix [set:<new>] | !prefix [new] | !setprefix <new>',
          aliases: ['setprefix'],
          options: [
            {
              name: 'action',
              type: 'STRING',
              description: 'Action to perform',
              choices: [
                { name: 'Set', value: 'set' },
                { name: 'Reset', value: 'reset' },
              ],
            },
          ],
          examples: ['!prefix ?', '!setprefix !'],
        },
        execute: vi.fn(),
      };

      const { embed } = HelpGenerator.generateCommandDetailView(
        cmdWithUsage,
        { defaultPrefix: '!' },
        'r!',
      );
      const data = embed.toJSON();

      const usageField = data.fields?.find((f) => f.name === 'Usage');
      expect(usageField?.value).toContain('r!prefix [new]');
      expect(usageField?.value).toContain('r!setprefix <new>');

      const syntaxField = data.fields?.find((f) => f.name === 'Syntax');
      expect(syntaxField?.value).toContain('r!prefix');

      const aliasesField = data.fields?.find((f) => f.name === 'Aliases');
      expect(aliasesField?.value).toContain('`r!setprefix`');

      const examplesField = data.fields?.find((f) => f.name === 'Examples');
      expect(examplesField?.value).toContain('`r!prefix ?`');

      const optionsField = data.fields?.find((f) => f.name === 'Arguments');
      expect(optionsField?.value).toContain('Subcommands / Choices: `set`, `reset`');

      const footer = data.footer?.text;
      expect(footer).toContain('Prefix: r!');
    });

    it('formats examples and syntax with dynamic server prefix instead of hardcoding !', () => {
      const { embed } = HelpGenerator.generateCommandDetailView(
        playCmd,
        { defaultPrefix: '!' },
        '?',
      );
      const data = embed.toJSON();
      const syntaxField = data.fields?.find((f) => f.name === 'Syntax');
      expect(syntaxField?.value).toContain('?play <query>');

      const aliasesField = data.fields?.find((f) => f.name === 'Aliases');
      expect(aliasesField?.value).toContain('`?p-music`');

      const examplesField = data.fields?.find((f) => f.name === 'Examples');
      expect(examplesField?.value).toContain('`/play query:YOASOBI`');
      expect(examplesField?.value).toContain('`?play "Idol"`');
      expect(examplesField?.value).not.toContain('!play');
    });

    it('renders active prefix in home view description and footer', () => {
      const { embed } = HelpGenerator.generateHomeView(registry, {}, '>>');
      const data = embed.toJSON();
      expect(data.description).toContain('(or `>>help <name>`)');
      expect(data.description).toContain('with prefix `>>`');
      expect(data.footer?.text).toContain('Prefix: >>');
    });

    it('renders active prefix in category view description and footer', () => {
      const { embed } = HelpGenerator.generateCategoryView(
        registry,
        CommandCategory.MUSIC,
        1,
        {},
        '>>',
      );
      const data = embed.toJSON();
      expect(data.description).toContain('(or `>>help <name>`)');
      expect(data.footer?.text).toContain('Prefix: >>');
    });
  });

  describe('createHelpCommand', () => {
    it('executes root home view when no command argument is passed', async () => {
      const helpCmd = createHelpCommand(registry);
      const mockReply = vi.fn().mockResolvedValue(undefined);

      const ctx = {
        options: {
          getString: vi.fn().mockReturnValue(null),
        },
        reply: mockReply,
      } as unknown as CommandContext;

      await helpCmd.execute(ctx);

      expect(mockReply).toHaveBeenCalledOnce();
      const callArg = mockReply.mock.calls[0]![0] as { embeds: unknown[]; components: unknown[] };
      expect(callArg.embeds.length).toBe(1);
      expect(callArg.components.length).toBeGreaterThanOrEqual(1);
    });

    it('executes deep inspector when a valid command argument is passed', async () => {
      const helpCmd = createHelpCommand(registry);
      const mockReply = vi.fn().mockResolvedValue(undefined);

      const ctx = {
        options: {
          getString: vi.fn().mockReturnValue('play'),
        },
        reply: mockReply,
      } as unknown as CommandContext;

      await helpCmd.execute(ctx);

      expect(mockReply).toHaveBeenCalledOnce();
      const callArg = mockReply.mock.calls[0]![0] as {
        embeds: { toJSON: () => { title: string } }[];
      };
      expect(callArg.embeds[0]?.toJSON().title).toBe('Command Inspector: /play');
    });

    it('returns friendly ephemeral warning when command is not found or hidden', async () => {
      const helpCmd = createHelpCommand(registry);
      const mockReply = vi.fn().mockResolvedValue(undefined);

      const ctx = {
        options: {
          getString: vi.fn().mockReturnValue('nonexistent'),
        },
        reply: mockReply,
      } as unknown as CommandContext;

      await helpCmd.execute(ctx);

      expect(mockReply).toHaveBeenCalledWith({
        content:
          '🔍 Command `nonexistent` was not found. Use `/help` to browse the command catalog.',
        ephemeral: true,
      });
    });

    it('resolves active server prefix via resolvePrefix callback', async () => {
      const resolvePrefix = vi.fn().mockResolvedValue('~');
      const helpCmd = createHelpCommand(registry, { resolvePrefix });
      const mockReply = vi.fn().mockResolvedValue(undefined);

      const ctx = {
        guildId: 'guild-123',
        source: 'slash',
        options: {
          getString: vi.fn().mockReturnValue(null),
        },
        reply: mockReply,
      } as unknown as CommandContext;

      await helpCmd.execute(ctx);

      expect(resolvePrefix).toHaveBeenCalledWith('guild-123');
      const callArg = mockReply.mock.calls[0]![0] as {
        embeds: { toJSON: () => { description: string; footer: { text: string } } }[];
      };
      expect(callArg.embeds[0]!.toJSON().description).toContain('`~`');
      expect(callArg.embeds[0]!.toJSON().footer.text).toContain('Prefix: ~');
    });

    it('uses invokedPrefix when executed via prefix command', async () => {
      const helpCmd = createHelpCommand(registry, { defaultPrefix: '!' });
      const mockReply = vi.fn().mockResolvedValue(undefined);

      const ctx = {
        guildId: null,
        source: 'prefix',
        invokedPrefix: '$',
        options: {
          getString: vi.fn().mockReturnValue('play'),
        },
        reply: mockReply,
      } as unknown as CommandContext;

      await helpCmd.execute(ctx);

      const callArg = mockReply.mock.calls[0]![0] as {
        embeds: { toJSON: () => { fields: { name: string; value: string }[] } }[];
      };
      const syntax = callArg.embeds[0]!.toJSON().fields.find((f) => f.name === 'Syntax');
      expect(syntax?.value).toContain('$play <query>');
    });
  });

  describe('handleHelpInteraction', () => {
    it('handles category select menu selection', async () => {
      const mockUpdate = vi.fn().mockResolvedValue(undefined);
      const mockSelectInteraction = {
        isStringSelectMenu: () => true,
        isButton: () => false,
        customId: 'help:category:select',
        values: [CommandCategory.MUSIC],
        update: mockUpdate,
      } as unknown as StringSelectMenuInteraction;

      const handled = await handleHelpInteraction(mockSelectInteraction, registry);

      expect(handled).toBe(true);
      expect(mockUpdate).toHaveBeenCalledOnce();
    });

    it('handles home navigation button', async () => {
      const mockUpdate = vi.fn().mockResolvedValue(undefined);
      const mockButtonInteraction = {
        isStringSelectMenu: () => false,
        isButton: () => true,
        customId: 'help:home',
        update: mockUpdate,
      } as unknown as ButtonInteraction;

      const handled = await handleHelpInteraction(mockButtonInteraction, registry);

      expect(handled).toBe(true);
      expect(mockUpdate).toHaveBeenCalledOnce();
    });

    it('handles pagination next and previous buttons', async () => {
      const mockUpdate = vi.fn().mockResolvedValue(undefined);
      const mockButtonInteraction = {
        isStringSelectMenu: () => false,
        isButton: () => true,
        customId: `help:page:next:${CommandCategory.MUSIC}:2`,
        update: mockUpdate,
      } as unknown as ButtonInteraction;

      const handled = await handleHelpInteraction(mockButtonInteraction, registry);

      expect(handled).toBe(true);
      expect(mockUpdate).toHaveBeenCalledOnce();
    });

    it('returns false for unrelated interactions', async () => {
      const mockUnrelated = {
        isStringSelectMenu: () => false,
        isButton: () => true,
        customId: 'game:play',
      } as unknown as ButtonInteraction;

      const handled = await handleHelpInteraction(mockUnrelated, registry);
      expect(handled).toBe(false);
    });

    it('uses resolvePrefix callback for interaction in a guild', async () => {
      const mockUpdate = vi.fn().mockResolvedValue(undefined);
      const mockSelectInteraction = {
        isStringSelectMenu: () => true,
        isButton: () => false,
        customId: 'help:category:select',
        values: [CommandCategory.MUSIC],
        guildId: 'guild-abc',
        update: mockUpdate,
      } as unknown as StringSelectMenuInteraction;

      const resolvePrefix = vi.fn().mockResolvedValue('.');
      const handled = await handleHelpInteraction(mockSelectInteraction, registry, {
        resolvePrefix,
      });

      expect(handled).toBe(true);
      expect(resolvePrefix).toHaveBeenCalledWith('guild-abc');
      const callArg = mockUpdate.mock.calls[0]![0] as {
        embeds: { toJSON: () => { footer: { text: string } } }[];
      };
      expect(callArg.embeds[0]!.toJSON().footer.text).toContain('Prefix: .');
    });
  });
});
