import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import {
  DiscordInteraction,
  DiscordMessage,
  SlashCommandOptionTypes,
} from '#command/command.types';
import { EmbedBuilder } from 'discord.js';
import { ImageUtil } from '#util/image/image.util';
import { DiscordPermissions } from '#util/features/permissions.util';

/**
 * FarewellCommand
 * @description Command to configure the farewell message
 * @category Command
 * @author Earnest Angel (https://angel.net.my)
 */
export default class FarewellCommand
  extends Command
  implements CommandInterface
{
  name = 'farewell';
  description = 'Configure the farewell message';
  category = 'guild';
  regex: RegExp = new RegExp(
    `^farewell$|^farewell (status|enable|disable|bg|channel) ?(.*)?$`,
  );
  usageExamples = [
    'farewell status',
    'farewell enable',
    'farewell disable',
    'farewell bg [background image]',
    'farewell channel [channel id]',
  ];

  permissions: DiscordPermissions = ['ManageGuild'];

  slashOptions = [
    {
      name: 'status',
      description: 'Get the current farewell status',
      type: SlashCommandOptionTypes.Subcommand,
    },
    {
      name: 'enable',
      description: 'Enable the farewell',
      type: SlashCommandOptionTypes.Subcommand,
    },
    {
      name: 'disable',
      description: 'Disable the farewell',
      type: SlashCommandOptionTypes.Subcommand,
    },
    {
      name: 'bg',
      description: 'Set the background image for the farewell card',
      type: SlashCommandOptionTypes.Subcommand,
      options: [
        {
          name: 'image',
          description: 'The background image',
          type: SlashCommandOptionTypes.String,
          required: true,
        },
      ],
    },
    {
      name: 'channel',
      description: 'Set the channel for the farewell',
      type: SlashCommandOptionTypes.Subcommand,
      options: [
        {
          name: 'channel',
          description: 'The channel for the farewell',
          type: SlashCommandOptionTypes.Channel,
          required: true,
        },
      ],
    },
  ];

  async runPrefix(message: DiscordMessage): Promise<any> {
    const params = this.params;
    if (params[0] === 'enable') return await this.enable(message);
    else if (params[0] === 'disable') return await this.disable(message);
    else if (params[0] === 'bg')
      return await this.setBackground(message, params[1]);
    else if (params[0] === 'channel') {
      // get first mentioned channel
      const channel = message.mentions.channels.first();
      return await this.setChannel(message, channel.id);
    } else await this.status(message);
  }

  async runSlash(interaction: DiscordInteraction): Promise<any> {
    // get the subcommand
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'enable') return await this.enable(interaction);
    else if (subcommand === 'disable') return await this.disable(interaction);
    else if (subcommand === 'bg') {
      const bg = interaction.options.getString('image');
      return await this.setBackground(interaction, bg);
    } else if (subcommand === 'channel') {
      const channel = interaction.options.getChannel('channel');
      return await this.setChannel(interaction, channel.id);
    } else return await this.status(interaction);
  }

  async enable(interaction: DiscordInteraction | DiscordMessage): Promise<any> {
    const guildDB = await this.db.guildRepository.findOne({
      where: { id: interaction.guild.id },
    });

    const status = guildDB.configurations.find(
      (config) => config.name === 'farewell_enabled',
    );

    if (status) {
      status.value = 'true';
      await this.db.guildConfigRepository.save(status);
    } else {
      await this.db.guildConfigRepository.save({
        name: 'farewell_enabled',
        value: 'true',
        guild: guildDB,
      });
    }

    const embed = this.prepareEmbed({
      title: 'Ririko Farewell',
      description: 'Farewell has been enabled',
      color: '#00ff00',
    });

    return interaction.reply({
      embeds: [embed],
    });
  }

  async disable(
    interaction: DiscordInteraction | DiscordMessage,
  ): Promise<any> {
    const guildDB = await this.db.guildRepository.findOne({
      where: { id: interaction.guild.id },
    });

    const status = guildDB.configurations.find(
      (config) => config.name === 'farewell_enabled',
    );

    if (status) {
      status.value = 'false';
      await this.db.guildConfigRepository.save(status);
    } else {
      await this.db.guildConfigRepository.save({
        name: 'farewell_enabled',
        value: 'false',
        guild: guildDB,
      });
    }

    const embed = this.prepareEmbed({
      title: 'Ririko Farewell',
      description: 'Farewell has been disabled',
      color: '#ff0000',
    });

    return interaction.reply({
      embeds: [embed],
    });
  }

  async setBackground(
    interaction: DiscordInteraction | DiscordMessage,
    newURL: string,
  ): Promise<any> {
    let embed;
    if ('deferReply' in interaction) {
      await interaction.deferReply();
    }
    // check if the url is an image
    const isValidImage = await ImageUtil.isImage(newURL);

    if (!isValidImage) {
      embed = this.prepareEmbed({
        title: 'Ririko Farewell',
        description: 'The URL provided is not an image',
        color: '#ff0000',
      });

      if ('editReply' in interaction)
        return await interaction.editReply({
          embeds: [embed],
        });
      else return await interaction.reply({ embeds: [embed] });
    }

    const guildDB = await this.db.guildRepository.findOne({
      where: { id: interaction.guild.id },
    });

    const bgUrl = guildDB.configurations.find(
      (config) => config.name === 'farewell_bg',
    );

    if (bgUrl) {
      bgUrl.value = newURL;
      await this.db.guildConfigRepository.save(bgUrl);
    } else {
      await this.db.guildConfigRepository.save({
        name: 'farewell_bg',
        value: newURL,
        guild: guildDB,
      });
    }

    embed = this.prepareEmbed({
      title: 'Ririko Farewell',
      description: 'Background image has been set',
      color: '#00ff00',
    });

    if ('editReply' in interaction)
      return await interaction.editReply({
        embeds: [embed],
      });
    else return await interaction.reply({ embeds: [embed] });
  }

  async setChannel(
    interaction: DiscordInteraction | DiscordMessage,
    newChannelID: string,
  ): Promise<any> {
    const guildDB = await this.db.guildRepository.findOne({
      where: { id: interaction.guild.id },
    });

    const channelID = guildDB.configurations.find(
      (config) => config.name === 'farewell_channel',
    );

    if (channelID) {
      channelID.value = newChannelID;
      await this.db.guildConfigRepository.save(channelID);
    } else {
      await this.db.guildConfigRepository.save({
        name: 'farewell_channel',
        value: newChannelID,
        guild: guildDB,
      });
    }

    const embed = this.prepareEmbed({
      title: 'Ririko Farewell',
      description: `Channel has been set to <#${newChannelID}>`,
      color: '#00ff00',
    });

    return interaction.reply({
      embeds: [embed],
    });
  }

  async status(interaction: DiscordInteraction | DiscordMessage): Promise<any> {
    const guildDB = await this.db.guildRepository.findOne({
      where: { id: interaction.guild.id },
    });

    const status = guildDB.configurations.find(
      (config) => config.name === 'farewell_enabled',
    );

    if (!status) {
      const embed = this.prepareEmbed({
        title: 'Ririko Farewell',
        description: 'Status: Farewell is not enabled',
        color: '#ff0000',
      });

      return interaction.reply({
        embeds: [embed],
      });
    }

    const channelID = guildDB.configurations.find(
      (config) => config.name === 'farewell_channel',
    );

    let channel;
    try {
      channel = await interaction.guild.channels.fetch(channelID.value);
    } catch (error) {
      console.error(error);
      const embed = this.prepareEmbed({
        title: 'Ririko Farewell',
        description:
          'Status: Channel not found. Please set the channel again using /farewell channel',
        color: '#ff0000',
      });

      return interaction.reply({
        embeds: [embed],
      });
    }

    const bgUrl = guildDB.configurations.find(
      (config) => config.name === 'farewell_bg',
    );

    const isDefault = !bgUrl;

    const embed = this.prepareEmbed({
      title: 'Ririko Farewell',
      description: `Status: Enabled\nChannel: ${channel}\nBackground: ${
        isDefault ? 'Default' : bgUrl.value
      }`,
      color: '#00ff00',
    });

    return interaction.reply({
      embeds: [embed],
    });
  }

  prepareEmbed(params: { title: string; description: string; color?: any }) {
    const embed = new EmbedBuilder()
      .setTitle(params.title)
      .setDescription(params.description)
      .setThumbnail(this.client.user.displayAvatarURL())
      .setColor(params.color)
      .setFooter({
        text: 'See the farewell help entry for more info\nMade with ❤️ by Ririko',
      })
      .setTimestamp();

    return embed;
  }
}
