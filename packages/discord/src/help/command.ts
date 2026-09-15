import type { Command, CommandContext } from '../command/types.js';
import { CommandCategory } from '../command/types.js';
import type { CommandRegistry } from '../router/registry.js';
import { HelpGenerator } from './generator.js';
import type { HelpOptions } from './types.js';

/**
 * Creates the production-grade, interactive /help command instance.
 * Automatically synchronizes with CommandRegistry to display categories, command listings, and deep inspection.
 */
export function createHelpCommand(registry: CommandRegistry, options: HelpOptions = {}): Command {
  return {
    metadata: {
      name: 'help',
      category: CommandCategory.GENERAL,
      description: 'Interactive Help Center and command documentation inspector',
      aliases: ['commands', 'h'],
      options: [
        {
          name: 'command',
          type: 'STRING',
          description: 'Specific command name to inspect in detail',
          required: false,
        },
      ],
      usage: '/help [command]',
      examples: ['/help', '/help command:ping', '!help play'],
    },
    async execute(ctx: CommandContext): Promise<void> {
      const query = ctx.options.getString('command');

      if (query && query.trim().length > 0) {
        const cmdName = query.trim().toLowerCase();
        const command = registry.get(cmdName);

        if (!command || command.metadata.isHidden) {
          await ctx.reply({
            content: `🔍 Command \`${query}\` was not found. Use \`/help\` to browse the command catalog.`,
            ephemeral: true,
          });
          return;
        }

        const { embed, components } = HelpGenerator.generateCommandDetailView(command, options);

        await ctx.reply({
          embeds: [embed],
          components,
        });
        return;
      }

      // Show root interactive Help Center
      const { embed, components } = HelpGenerator.generateHomeView(registry, options);
      await ctx.reply({
        embeds: [embed],
        components,
      });
    },
  };
}
