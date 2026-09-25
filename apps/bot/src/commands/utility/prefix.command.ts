import { EmbedBuilder, PermissionsBitField } from 'discord.js';
import {
  CommandCategory,
  DEFAULT_COMMAND_PREFIX,
  type Command,
  type CommandContext,
  CommandGuildOnlyError,
  CommandPermissionError,
} from '@ririko/discord';
import type { BotServices } from '../../services.js';

/**
 * Creates the dual-dispatch `/prefix` and `!prefix` command.
 * Allows viewing the current prefix or setting a new custom prefix for the server.
 */
export function createPrefixCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'prefix',
      category: CommandCategory.UTILITY,
      description: 'View or update the command prefix for this server',
      aliases: ['setprefix'],
      usage: '/prefix [set:<new_prefix>] | !prefix [new_prefix] | !setprefix <new_prefix>',
      examples: ['/prefix', '/prefix set:?', '!prefix', '!prefix ?', '!setprefix !'],
      options: [
        {
          name: 'set',
          description: 'New command prefix to set for this server (1-5 chars)',
          type: 'STRING',
          required: false,
        },
      ],
    },

    async execute(ctx: CommandContext): Promise<void> {
      let requestedPrefix: string | undefined;

      if (ctx.source === 'prefix') {
        const rawArgs = ctx.options.getRawArgs();
        if (rawArgs.length > 0) {
          requestedPrefix = rawArgs[0];
        }
      } else {
        requestedPrefix = ctx.options.getString('set') ?? undefined;
      }

      // VIEW MODE: No prefix argument provided
      if (!requestedPrefix) {
        if (!ctx.guild) {
          const defaultPrefix = process.env.DEFAULT_PREFIX || DEFAULT_COMMAND_PREFIX;
          await ctx.reply({
            embeds: [
              new EmbedBuilder()
                .setColor(0x5865f2)
                .setTitle('⚙️ Command Prefix')
                .setDescription(
                  `In Direct Messages, use the standard default prefix \`${defaultPrefix}\` or slash commands like \`/help\`.\n\n` +
                    `Custom prefixes can be configured within Discord servers by server administrators.`,
                )
                .setFooter({ text: 'Ririko AI 2.0 • Server Utilities' }),
            ],
          });
          return;
        }

        const currentPrefix = await services.guildSettingsService.getPrefix(ctx.guild.id);
        const embed = new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('⚙️ Server Command Prefix')
          .setDescription(
            `The current command prefix for **${ctx.guild.name}** is: \`${currentPrefix}\`\n\n` +
              `• **Run commands:** \`${currentPrefix}help\`, \`${currentPrefix}ping\`, \`${currentPrefix}cards\`\n` +
              `• **Change prefix:** \`${currentPrefix}prefix <new_prefix>\` or \`/prefix set:<new_prefix>\``,
          )
          .addFields([
            {
              name: 'ℹ️ Permission Requirement',
              value:
                'Changing the server prefix requires the **Manage Server** (`ManageGuild`) permission.',
            },
          ])
          .setFooter({ text: 'Ririko AI 2.0 • Server Utilities' });

        await ctx.reply({ embeds: [embed] });
        return;
      }

      // SET MODE: Prefix argument provided
      if (!ctx.guild) {
        throw new CommandGuildOnlyError('The command prefix can only be modified within a server.');
      }

      // Check user permissions
      const member = ctx.member;
      const hasPermission = member && member.permissions.has(PermissionsBitField.Flags.ManageGuild);

      if (!hasPermission) {
        throw new CommandPermissionError(
          'You need the **Manage Server** permission to change the bot prefix.',
          {
            missingPermissions: ['ManageGuild'],
            missingFor: 'user',
          },
        );
      }

      const updated = await services.guildSettingsService.setPrefix(ctx.guild.id, requestedPrefix);

      const embed = new EmbedBuilder()
        .setColor(0x57f287) // Success Green
        .setTitle('✅ Server Prefix Updated')
        .setDescription(
          `The command prefix for **${ctx.guild.name}** has been updated to: \`${updated.prefix}\`\n\n` +
            `Try it out:\n` +
            `• \`${updated.prefix}help\` — Browse available commands\n` +
            `• \`${updated.prefix}ping\` — Check connection latency\n` +
            `• \`${updated.prefix}timezone\` — View or set the server timezone`,
        )
        .setFooter({ text: 'Ririko AI 2.0 • Server Utilities' });

      await ctx.reply({ embeds: [embed] });
    },
  };
}
