import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import {
  DiscordMessage,
  SlashCommandOptionTypes,
} from '#command/command.types';
import { EmbedBuilder } from 'discord.js';
import { GuildConfig } from '#database/entities/guild-config.entity';
import { Injectable } from '@nestjs/common';

@Injectable()
export default class AiModelCommand
  extends Command
  implements CommandInterface
{
  name = 'ai-model';
  description = 'Set the AI model to use';
  category = 'ai';
  regex = new RegExp('^ai-model$|^ai-model ', 'i');
  usageExamples = [
    'ai-model',
    'ai-model set <model>',
    'ai-model pull',
    'ai-model pull-default',
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
          description: 'The model to set',
          required: true,
        },
      ],
    },
    {
      type: SlashCommandOptionTypes.Subcommand,
      name: 'pull',
      description: 'Pull the model that is set in the database',
    },
    {
      type: SlashCommandOptionTypes.Subcommand,
      name: 'pull-default',
      description: 'Pull the default model from the current service',
    },
    {
      type: SlashCommandOptionTypes.Subcommand,
      name: 'reset',
      description: 'Reset the AI model to the default',
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

      const model = this.params.slice(1).join(' ');
      const response = await this.setModel(message.guild, model);

      if (!response) {
        await message.reply({
          embeds: [this.prepareEmbed('Failed to set model', true)],
        });
        return;
      }

      await message.reply({
        embeds: [
          this.prepareEmbed(
            `Model set to: ${model}. Don't forget to run /ai-model pull if you haven't downloaded the model yet.`,
            false,
          ),
        ],
      });
    } else if (subcommand === 'pull') {
      const reply = await message.reply('Pulling model...');

      const response = await this.pullModel(message.guild.id);
      for await (const part of response) {
        await reply.edit(`Status: ${part.status}`);
      }
    } else if (subcommand === 'pull-default') {
      const reply = await message.reply(
        'Pulling default model from service...',
      );

      const response = await this.pullDefaultModel();
      for await (const part of response) {
        await reply.edit(`Status: ${part.status}`);
      }
    } else if (subcommand === 'reset') {
      const guildDB = await this.db.guildRepository.findOne({
        where: { id: message.guild.id },
      });

      const modelDB = guildDB.configurations.find(
        (config) => config.name === 'ai_model',
      );

      if (modelDB) {
        await this.db.guildConfigRepository.remove(modelDB);
        await message.reply({
          embeds: [this.prepareEmbed('AI model reset to default', false)],
        });
      } else {
        await message.reply({
          embeds: [this.prepareEmbed('No AI model set to reset', true)],
        });
      }
    } else {
      await message.reply({
        embeds: [
          this.prepareEmbed('No subcommand provided. See /help ai-model', true),
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
        embeds: [
          this.prepareEmbed(
            `Model set to: ${model}. Don't forget to run /ai-model pull if you haven't downloaded the model yet.`,
            false,
          ),
        ],
      });
    } else if (subcommand === 'pull') {
      await interaction.deferReply();
      const response = await this.pullModel(interaction.guild.id);
      for await (const part of response) {
        await interaction.editReply(`Status: ${part.status}`);
      }
    } else if (subcommand === 'pull-default') {
      await interaction.deferReply();
      const response = await this.pullDefaultModel();
      for await (const part of response) {
        await interaction.editReply(`Status: ${part.status}`);
      }
    } else if (subcommand === 'reset') {
      const guildDB = await this.db.guildRepository.findOne({
        where: { id: interaction.guild.id },
      });

      const modelDB = guildDB.configurations.find(
        (config) => config.name === 'ai_model',
      );

      if (modelDB) {
        await this.db.guildConfigRepository.remove(modelDB);
        await interaction.reply({
          embeds: [this.prepareEmbed('AI model reset to default', false)],
        });
      } else {
        await interaction.reply({
          embeds: [this.prepareEmbed('No AI model set to reset', true)],
        });
      }
    }
  }

  async setModel(guild, model): Promise<GuildConfig> {
    try {
      const guildDB = await this.db.guildRepository.findOne({
        where: { id: guild.id },
      });

      let modelDB = guildDB.configurations.find(
        (config) => config.name === 'ai_model',
      );

      if (modelDB) {
        modelDB.value = model;
        modelDB = await this.db.guildConfigRepository.save(modelDB);
      } else {
        modelDB = await this.db.guildConfigRepository.save({
          name: 'ai_model',
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

  async pullModel(guildId) {
    const guildDB = await this.db.guildRepository.findOne({
      where: { id: guildId },
    });

    const model = guildDB.configurations.find(
      (config) => config.name === 'ai_model',
    );

    // Get the AI service from the factory
    const aiService = this.services.aiServiceFactory.getService();
    const defaultModel = this.services.aiServiceFactory.getDefaultModel();

    if (model) {
      return aiService.pullModel(model.value);
    } else {
      return aiService.pullModel(defaultModel);
    }
  }

  /**
   * Pull the default model from the current service
   * This uses the default model defined in the service's chat method
   * @returns AsyncIterable with status updates
   */
  async pullDefaultModel() {
    // Get the AI service from the factory
    const aiService = this.services.aiServiceFactory.getService();

    // Get the service type to determine which default model to use
    const serviceType = this.services.aiServiceFactory.getServiceType();

    // Define default models for each service type based on their chat method defaults
    let defaultServiceModel: string;
    switch (serviceType) {
      case 'ollama':
        defaultServiceModel = 'llama3.2:1b';
        break;
      case 'google-ai':
        defaultServiceModel = 'gemini-2.0-flash';
        break;
      case 'openrouter':
        defaultServiceModel = 'meta-llama/llama-3.3-8b-instruct:free';
        break;
      case 'openai':
        defaultServiceModel = 'gpt-4.1-nano';
        break;
      default:
        // Fallback to the configured default model if service type is unknown
        defaultServiceModel = this.services.aiServiceFactory.getDefaultModel();
    }

    return aiService.pullModel(defaultServiceModel);
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
