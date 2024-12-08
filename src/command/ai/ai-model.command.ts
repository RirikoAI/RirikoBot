import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import {
  DiscordMessage,
  SlashCommandOptionTypes,
} from '#command/command.types';
import { EmbedBuilder } from 'discord.js';
import { GuildConfig } from '#database/entities/guild-config.entity';
import ollama from 'ollama';

export default class AiModelCommand
  extends Command
  implements CommandInterface
{
  name = 'ai-model';
  description = 'Set the AI model to use';
  category = 'ai';
  regex = new RegExp('^ai-model$|^ai-model ', 'i');
  usageExamples = ['ai-model', 'ai-model set <model>', 'ai-model pull'];

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

    if (model) {
      return ollama.pull({
        model: model.value,
        stream: true,
      });
    } else {
      return ollama.pull({
        model: 'llama3.2:1b',
        stream: true,
      });
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
