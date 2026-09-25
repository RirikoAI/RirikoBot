import { EmbedBuilder, PermissionsBitField } from 'discord.js';
import {
  CommandCategory,
  type Command,
  type CommandContext,
  CommandGuildOnlyError,
  CommandPermissionError,
} from '@ririko/discord';
import type { BotServices } from '../../services.js';

export function createWelcomerCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'welcomer',
      category: CommandCategory.UTILITY,
      description: 'Configure the server welcome message and card',
      aliases: ['welcome'],
      usage: '/welcomer [channel] [message] [background] [color] [enable]',
      examples: [
        '/welcomer',
        '/welcomer channel:#welcome',
        '/welcomer message:Welcome {user} to {server}!',
        '/welcomer background:https://example.com/bg.png',
        '/welcomer color:#ff0000',
        '/welcomer enable:false',
      ],
      options: [
        {
          name: 'channel',
          description: 'The channel to send welcome messages in',
          type: 'CHANNEL',
          required: false,
        },
        {
          name: 'message',
          description: 'The welcome message template ({user}, {server}, {memberCount})',
          type: 'STRING',
          required: false,
        },
        {
          name: 'background',
          description: 'URL of the background image for the welcome card',
          type: 'STRING',
          required: false,
        },
        {
          name: 'color',
          description: 'Hex color for the welcome card text and border',
          type: 'STRING',
          required: false,
        },
        {
          name: 'enable',
          description: 'Enable or disable the welcomer',
          type: 'BOOLEAN',
          required: false,
        },
      ],
    },

    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guild) {
        throw new CommandGuildOnlyError('The welcomer can only be configured within a server.');
      }

      const member = ctx.member;
      const hasPermission = member && member.permissions.has(PermissionsBitField.Flags.ManageGuild);

      if (!hasPermission) {
        throw new CommandPermissionError(
          'You need the **Manage Server** permission to configure the welcomer.',
          {
            missingPermissions: ['ManageGuild'],
            missingFor: 'user',
          },
        );
      }

      let channelId: string | undefined;
      let messageTemplate: string | undefined;
      let backgroundUrl: string | undefined;
      let textColor: string | undefined;
      let enable: boolean | undefined;

      if (ctx.source === 'prefix') {
        const rawArgs = ctx.options.getRawArgs();
        if (rawArgs.length > 0) {
          // Simplistic parsing for prefix: e.g. !welcomer channel #welcome message Hello
          // For simplicity, we just recommend slash commands for complex configs,
          // or we can parse simple key-values.
          // If no args, just show config.
          // Let's rely on slash commands for setting fields, or require the user to use slash commands.
          // Wait, the requirement says "dual-dispatch configuration commands".
          // So we should support setting things via prefix if possible.
          // A simple way is to treat the first arg as action and second as value.
          const action = rawArgs[0]!.toLowerCase();
          const value = rawArgs.slice(1).join(' ');
          if (action === 'channel') channelId = value.replace(/<#|>/g, '');
          else if (action === 'message') messageTemplate = value;
          else if (action === 'background') backgroundUrl = value;
          else if (action === 'color') textColor = value;
          else if (action === 'enable')
            enable = ['true', 'on', 'yes', '1'].includes(value.toLowerCase());
          else if (action === 'disable') enable = false;
        }
      } else {
        const channel = await ctx.options.getChannel('channel');
        channelId = channel?.id;
        messageTemplate = ctx.options.getString('message') ?? undefined;
        backgroundUrl = ctx.options.getString('background') ?? undefined;
        textColor = ctx.options.getString('color') ?? undefined;
        const enableOpt = ctx.options.getBoolean('enable');
        if (enableOpt !== null) enable = enableOpt;
      }

      let config = await services.welcomerRepo.getWelcomeConfig(ctx.guild!.id);

      const isUpdate =
        channelId !== undefined ||
        messageTemplate !== undefined ||
        backgroundUrl !== undefined ||
        textColor !== undefined ||
        enable !== undefined;

      if (isUpdate) {
        if (backgroundUrl) {
          const isValid = await services.welcomerService.validateBackgroundUrl(backgroundUrl);
          if (!isValid) {
            await ctx.reply(
              '❌ The provided background URL is invalid or points to a restricted IP address. Please provide a valid public image URL.',
            );
            return;
          }
        }

        const newData = {
          guildId: ctx.guild!.id,
          channelId: channelId ?? config?.channelId ?? '',
          messageTemplate:
            messageTemplate ?? config?.messageTemplate ?? 'Welcome to {server}, {user}!',
          cardTheme: config?.cardTheme ?? 'DEFAULT',
          backgroundUrl:
            backgroundUrl === 'none' ? null : (backgroundUrl ?? config?.backgroundUrl ?? null),
          textColor: textColor ?? config?.textColor ?? '#ffffff',
          isEnabled: enable ?? config?.isEnabled ?? true,
        };

        if (!newData.channelId && newData.isEnabled) {
          await ctx.reply(
            '❌ You must set a channel before enabling the welcomer. Example: `/welcomer channel:#welcome`',
          );
          return;
        }

        config = await services.welcomerRepo.setWelcomeConfig(newData);

        await ctx.reply(`✅ Welcomer configuration updated.`);
      }

      if (!config) {
        await ctx.reply(
          'ℹ️ Welcomer is not configured for this server. Use `/welcomer channel:#welcome` to set it up.',
        );
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(config.isEnabled ? 0x57f287 : 0xed4245)
        .setTitle('👋 Server Welcomer Configuration')
        .addFields([
          { name: 'Status', value: config.isEnabled ? '✅ Enabled' : '❌ Disabled', inline: true },
          {
            name: 'Channel',
            value: config.channelId ? `<#${config.channelId}>` : 'Not set',
            inline: true,
          },
          { name: 'Text Color', value: `\`${config.textColor}\``, inline: true },
          { name: 'Message Template', value: `\`${config.messageTemplate}\``, inline: false },
          {
            name: 'Background URL',
            value: config.backgroundUrl ? `[Link](${config.backgroundUrl})` : 'Default',
            inline: false,
          },
        ])
        .setFooter({ text: 'Ririko AI 2.0 • Server Utilities' });

      await ctx.reply({ embeds: [embed] });
    },
  };
}
