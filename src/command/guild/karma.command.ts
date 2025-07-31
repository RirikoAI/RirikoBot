import { Injectable } from '@nestjs/common';
import { PermissionFlagsBits } from 'discord.js';
import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import {
  DiscordInteraction,
  DiscordMessage,
  SlashCommandOptionTypes,
} from '#command/command.types';
import { GuildConfig } from '#database/entities/guild-config.entity';

interface KarmaProfile {
  karma: number;
  enabled: boolean;
}

@Injectable()
export default class KarmaCommand extends Command implements CommandInterface {
  name = 'karma';
  regex = /^karma(?:\s+.*)?$/i;
  description = 'View or manage the karma system for this server';
  category = 'guild';
  usageExamples = [
    'karma',
    'karma enable',
    'karma disable',
    'karma enable-server',
    'karma disable-server',
  ];

  slashOptions = [
    {
      name: 'server',
      description:
        'Enable/disable the karma notification system for the whole server',
      type: SlashCommandOptionTypes.SubcommandGroup,
      options: [
        {
          name: 'enable-server',
          description:
            'Enable the karma notification system for the whole server',
          type: SlashCommandOptionTypes.Subcommand,
        },
        {
          name: 'disable-server',
          description:
            'Disable the karma notification system for the whole server',
          type: SlashCommandOptionTypes.Subcommand,
        },
      ],
    },
    {
      name: 'enable',
      description: 'Enable the karma notification system for your profile',
      type: SlashCommandOptionTypes.Subcommand,
    },
    {
      name: 'disable',
      description: 'Disable the karma notification system for your profile',
      type: SlashCommandOptionTypes.Subcommand,
    },
    {
      name: 'view',
      description: 'View your karma profile',
      type: SlashCommandOptionTypes.Subcommand,
    },
  ];

  private readonly subcommandResponses = {
    enable: 'Karma notifications have been enabled for your profile.',
    disable: 'Karma notifications have been disabled for your profile.',
    'enable-server': 'Karma notifications have been enabled for the server.',
    'disable-server': 'Karma notifications have been disabled for the server.',
  };

  async runPrefix(message: DiscordMessage): Promise<void> {
    const [_, ...params] = message.content.trim().split(/\s+/);
    const [first, second] = params;
    const subcommand = [first, second].filter(Boolean).join('-') || 'view';

    if (await this.handlePermissions(message.member, subcommand, message))
      return;

    await this.handleCommand(message, subcommand, false);
  }

  async runSlash(interaction: DiscordInteraction): Promise<void> {
    const subcommand = interaction.options.getSubcommand();

    if (
      await this.handlePermissions(interaction.member, subcommand, interaction)
    )
      return;

    await this.handleCommand(interaction, subcommand, true);
  }

  private async handlePermissions(
    member: any,
    subcommand: string,
    context: DiscordMessage | DiscordInteraction,
  ): Promise<boolean> {
    const isServerCommand = subcommand.includes('server');

    const permissionError = await this.checkPermissions(
      member,
      isServerCommand,
    );

    if (permissionError) {
      const response = { content: permissionError };
      (('reply' in context) as any)
        ? await context.reply(
            'ephemeral' in context
              ? { ...response, ephemeral: true }
              : response,
          )
        : await context.reply(response.content);
      return true;
    }

    return false;
  }

  private async handleCommand(
    context: DiscordMessage | DiscordInteraction,
    subcommand: string,
    ephemeral: boolean,
  ): Promise<void> {
    if (subcommand === 'view') {
      const user = 'author' in context ? context.author : context.user;
      const karmaProfile = await this.getKarmaProfile(user);
      const content = `Your current karma is: ${karmaProfile.karma}. You have notifications ${karmaProfile.enabled ? 'enabled' : 'disabled'}.`;

      await context.reply(ephemeral ? { content, ephemeral } : content);
      return;
    }

    const response = this.subcommandResponses[subcommand];
    if (!response) {
      await context.reply(
        ephemeral
          ? {
              content: 'Invalid subcommand.',
              ephemeral: true,
            }
          : 'Invalid subcommand. See /help karma for usage examples.',
      );
      return;
    }

    await this.updateKarmaSettings(context, subcommand);
    await context.reply(
      ephemeral ? { content: response, ephemeral } : response,
    );
  }

  private async updateKarmaSettings(
    context: DiscordMessage | DiscordInteraction,
    subcommand: string,
  ): Promise<void> {
    const isServerCommand = subcommand.includes('server');
    const isEnable = subcommand.includes('enable');

    if (isServerCommand) {
      await this.setGuildConfig(context.guild, isEnable);
    } else {
      const user = 'author' in context ? context.author : context.user;
      const userDB = await this.services.economy.getUser(user);
      userDB.doNotNotifyOnLevelUp = !isEnable;
      await this.db.userRepository.save(userDB);
    }
  }

  private async checkPermissions(
    member: any,
    isServerCommand: boolean,
  ): Promise<string | null> {
    if (
      isServerCommand &&
      !member.permissions.has(PermissionFlagsBits.Administrator)
    ) {
      return 'You need Administrator permission to use this command.';
    }
    return null;
  }

  async getKarmaProfile(user: any): Promise<KarmaProfile> {
    const userDB = await this.services.economy.getUser(user);
    return {
      karma: userDB.karma,
      enabled: !userDB.doNotNotifyOnLevelUp,
    };
  }

  async setGuildConfig(guild: any, enable: boolean): Promise<GuildConfig> {
    try {
      const guildDB = await this.db.guildRepository.findOne({
        where: { id: guild.id },
      });

      let config = guildDB.configurations.find(
        (c) => c.name === 'karma-notification-enabled',
      );

      if (config) {
        config.value = enable ? 'enabled' : 'disabled';
        return await this.db.guildConfigRepository.save(config);
      }

      return await this.db.guildConfigRepository.save({
        name: 'karma-notification-enabled',
        value: enable ? 'enabled' : 'disabled',
        guild: guildDB,
      });
    } catch (error) {
      console.error(error);
      return null;
    }
  }
}
