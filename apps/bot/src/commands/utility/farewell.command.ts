import { EmbedBuilder, PermissionsBitField } from 'discord.js';
import {
  CommandCategory,
  type Command,
  type CommandContext,
  CommandGuildOnlyError,
  CommandPermissionError,
} from '@ririko/discord';
import type { BotServices } from '../../services.js';

export function createFarewellCommand(services: BotServices): Command {
  return {
    metadata: {
      name: 'farewell',
      category: CommandCategory.UTILITY,
      description: 'Configure the server farewell message and card',
      aliases: ['goodbye'],
      usage: '/farewell [channel] [message] [background] [color] [enable]',
      examples: [
        '/farewell',
        '/farewell channel:#goodbye',
        '/farewell message:Goodbye {user}!',
        '/farewell background:https://example.com/bg.png',
        '/farewell color:#ff0000',
        '/farewell enable:false',
      ],
      options: [
        {
          name: 'channel',
          description: 'The channel to send farewell messages in',
          type: 'CHANNEL',
          required: false,
        },
        {
          name: 'message',
          description: 'The farewell message template ({user}, {server}, {memberCount})',
          type: 'STRING',
          required: false,
        },
        {
          name: 'background',
          description: 'URL of the background image for the farewell card',
          type: 'STRING',
          required: false,
        },
        {
          name: 'color',
          description: 'Hex color for the farewell card text and border',
          type: 'STRING',
          required: false,
        },
        {
          name: 'enable',
          description: 'Enable or disable the farewell messages',
          type: 'BOOLEAN',
          required: false,
        },
      ],
    },

    async execute(ctx: CommandContext): Promise<void> {
      if (!ctx.guild) {
        throw new CommandGuildOnlyError(
          'The farewell configuration can only be used within a server.',
        );
      }

      const member = ctx.member;
      const hasPermission = member && member.permissions.has(PermissionsBitField.Flags.ManageGuild);

      if (!hasPermission) {
        throw new CommandPermissionError(
          'You need the **Manage Server** permission to configure farewell messages.',
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

      let config = await services.welcomerRepo.getFarewellConfig(ctx.guild!.id);

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
          messageTemplate: messageTemplate ?? config?.messageTemplate ?? 'Goodbye {user}!',
          cardTheme: config?.cardTheme ?? 'DEFAULT',
          backgroundUrl:
            backgroundUrl === 'none' ? null : (backgroundUrl ?? config?.backgroundUrl ?? null),
          textColor: textColor ?? config?.textColor ?? '#ffffff',
          isEnabled: enable ?? config?.isEnabled ?? true,
        };

        if (!newData.channelId && newData.isEnabled) {
          await ctx.reply(
            '❌ You must set a channel before enabling farewell messages. Example: `/farewell channel:#goodbye`',
          );
          return;
        }

        config = await services.welcomerRepo.setFarewellConfig(newData);

        await ctx.reply(`✅ Farewell configuration updated.`);
      }

      if (!config) {
        await ctx.reply(
          'ℹ️ Farewell messages are not configured for this server. Use `/farewell channel:#goodbye` to set it up.',
        );
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(config.isEnabled ? 0x57f287 : 0xed4245)
        .setTitle('👋 Server Farewell Configuration')
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
