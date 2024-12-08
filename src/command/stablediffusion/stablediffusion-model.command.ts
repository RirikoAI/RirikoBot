import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import {
  DiscordMessage,
  SlashCommandOptionTypes,
} from '#command/command.types';
import { EmbedBuilder } from 'discord.js';
import { GuildConfig } from '#database/entities/guild-config.entity';

export default class StableDiffusionModelCommand
  extends Command
  implements CommandInterface
{
  name = 'stablediffusion-model';
  description = 'Set the StableDiffusion model to use';
  category = 'stablediffusion';
  regex = new RegExp('^stablediffusion-model$|^stablediffusion-model ', 'i');
  usageExamples = [
    'stablediffusion-model',
    'stablediffusion-model set <model>',
  ];

  slashOptions = [
    {
      type: SlashCommandOptionTypes.Subcommand,
      name: 'set',
      description: 'Input the model to set',
      options: [
        {
          type: SlashCommandOptionTypes.String,
          name: 'model',
          description:
            'The model to set (looks something like stability-ai/stable-diffusion or luma/photon)',
          required: true,
        },
      ],
    },
  ];

  async runPrefix(message: DiscordMessage): Promise<void> {
    const subcommand = this.params[0];
    if (subcommand === 'set') {
      // check if parameters are provided
      if (!this.allParams) {
        await message.reply({
          embeds: [this.prepareEmbed('Please provide a model', true)],
        });
        return;
      }

      const model = this.allParams;
      const response = await this.setModel(message.guild, model);

      if (!response) {
        await message.reply({
          embeds: [this.prepareEmbed('Failed to set model', true)],
        });
        return;
      }

      await message.reply({
        embeds: [this.prepareEmbed(`Model set to: ${model}.`, false)],
      });
    } else {
      await message.reply({
        embeds: [
          this.prepareEmbed(
            'No subcommand provided. See /help stablediffusion-model',
            true,
          ),
        ],
      });
    }
  }

  async runSlash(interaction): Promise<void> {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'set') {
      const model = interaction.options.getString('model');
      const response = await this.setModel(interaction.guild, model);

      if (!response) {
        await interaction.reply({
          embeds: [this.prepareEmbed('Failed to set model', true)],
        });
        return;
      }

      await interaction.reply({
        embeds: [this.prepareEmbed(`Model set to: ${model}.`, false)],
      });
    } else {
      await interaction.reply({
        embeds: [
          this.prepareEmbed(
            'No subcommand provided. See /help stablediffusion-model',
            true,
          ),
        ],
      });
    }
  }

  async setModel(guild, model): Promise<GuildConfig> {
    try {
      const guildDB = await this.db.guildRepository.findOne({
        where: { id: guild.id },
      });

      let modelDB = guildDB.configurations.find(
        (config) => config.name === 'stablediffusion_model',
      );

      if (modelDB) {
        modelDB.value = model;
        modelDB = await this.db.guildConfigRepository.save(modelDB);
      } else {
        modelDB = await this.db.guildConfigRepository.save({
          name: 'stablediffusion_model',
          value: model,
          guild: guildDB,
        });
      }

      return modelDB;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  prepareEmbed(text, isError): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle('Set Model')
      .setDescription(text)
      .setColor(isError ? '#ff0000' : '#00ff00')
      .setTimestamp()
      .setFooter({
        text: 'Made with ❤️ by Ririko',
      });

    return embed;
  }
}
