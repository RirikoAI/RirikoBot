// @ts-nocheck
import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import {
  DiscordInteraction,
  DiscordMessage,
  SlashCommandOptionTypes,
} from '#command/command.types';
import Replicate from 'replicate';
import { EmbedBuilder } from 'discord.js';

export default class ImagineCommand
  extends Command
  implements CommandInterface
{
  name = 'imagine';
  description =
    'Imagine a world of possibilities limited only by your imagination';
  regex = new RegExp(`^imagine$|^imagine `, 'i');
  category = 'stablediffusion';
  usageExamples = ['imagine', 'imagine <something>'];

  slashOptions = [
    {
      type: SlashCommandOptionTypes.String,
      name: 'prompt',
      description: 'Something you would want to see',
      required: true,
    },
  ];

  currentUserPrompts: {
    userId: string;
    prompt: string;
  }[] = [];

  async runPrefix(message: DiscordMessage): Promise<any> {
    const prompt = this.allParams;
    // check if parameters are provided
    if (!prompt) {
      await message.reply({
        embeds: [
          this.prepareEmbed({
            message: 'Please provide a prompt',
            error: true,
          }),
        ],
      });
      return;
    }

    // push the prompts associated with the user
    this.currentUserPrompts.push({ userId: message.member.id, prompt });

    const result = await this.imagine(
      prompt,
      message.guild.id,
      message.author.id,
    );

    await message.reply({
      embeds: [
        this.prepareEmbed({
          message: result ? 'Here is your imagination' : 'Failed to imagine',
          error: !result,
          image: result.url().href,
          url: result.url().href,
        }),
      ],
    });

    await this.showNextAction(message, prompt);
  }

  async runSlash(interaction: DiscordInteraction): Promise<any> {
    await interaction.deferReply();
    const prompt = interaction.options.getString('prompt');
    if (!prompt) {
      await interaction.editReply({
        embeds: [
          this.prepareEmbed({
            message: 'Please provide a prompt',
            error: true,
          }),
        ],
      });
      return;
    }

    // push the prompts associated with the user
    this.currentUserPrompts.push({ userId: interaction.user.id, prompt });

    const result = await this.imagine(
      prompt,
      interaction.guild.id,
      interaction.user.id,
    );

    if (!result) {
      await interaction.editReply({
        embeds: [
          this.prepareEmbed({
            message:
              'Failed to imagine. Please check if you have set the API token',
            error: true,
          }),
        ],
      });
      return;
    }

    await interaction.editReply({
      embeds: [
        this.prepareEmbed({
          message: result ? 'Here is your imagination' : 'Failed to imagine',
          error: !result,
          image: result.url().href,
          url: result.url().href,
        }),
      ],
    });

    await this.showNextAction(interaction, prompt);
  }

  async showNextAction(interaction, prompt) {
    await this.createMenu({
      interaction,
      text: 'Do you want to generate another image?',
      options: [
        {
          label: 'Yes',
          value: prompt,
          description: 'Generate another image',
        },
        {
          label: 'No',
          value: 'no',
          description: 'No, I am done',
        },
      ],
      callback: this.handleNextAction.bind(this),
      followUp: true,
    });
  }

  async handleNextAction(
    interaction: DiscordInteraction,
    selectedOption: string,
  ) {
    await interaction.deferReply();
    if (selectedOption === 'no') {
      await interaction.editReply('Thank you for using Ririko StableDiffusion');
      // remove the user from the prompts
      this.currentUserPrompts = this.currentUserPrompts.filter(
        (prompt) => prompt.userId !== interaction.user.id,
      );
      return;
    }

    const result = await this.imagine(
      selectedOption,
      interaction.guild.id,
      interaction.user.id,
    );

    if (!result) {
      await interaction.editReply({
        embeds: [
          this.prepareEmbed({
            message:
              'Failed to imagine. Please check if you have set the API token or if you have set the right model.',
            error: true,
          }),
        ],
      });
      return;
    }

    await interaction.editReply({
      embeds: [
        this.prepareEmbed({
          message: result ? 'Here is your imagination' : 'Failed to imagine',
          error: !result,
          image: result.url().href,
          url: result.url().href,
        }),
      ],
    });

    await this.showNextAction(interaction, selectedOption);
  }

  async imagine(prompt, guildId, userId): Promise<any> {
    try {
      const config = await this.db.configRepository.findOne({
        where: { applicationId: process.env.DISCORD_APPLICATION_ID },
      });

      const replicate = new Replicate({
        // get your token from https://replicate.com/account/api-tokens
        auth: config.stableDiffusionApiToken, // defaults to process.env.REPLICATE_API_TOKEN
      });

      // get the guildConfig
      const guildDB = await this.db.guildRepository.findOne({
        where: { id: guildId },
      });

      let model = guildDB.configurations.find(
        (config) => config.name === 'stablediffusion_model',
      )?.value;

      if (!model) {
        model = 'luma/photon';
      }

      const input = {
        prompt,
      };

      const output = await replicate.run(model as any, { input });
      
      if (!output.url()) {
        throw 'Failed to imagine. Please check if you have set the API token';
      }

      return output;
    } catch (error) {
      console.error(
        'Failed to imagine. Please check if you have set the API token or if you have set the right model.',
        error,
      );
      return false;
    }
  }

  prepareEmbed(params: {
    message: string;
    error?: boolean;
    image?: any;
    url?: string;
  }): any {
    return new EmbedBuilder()
      .setTitle('Ririko StableDiffusion')
      .setDescription(params.message)
      .setColor(params.error ? '#ff0000' : '#00ff00')
      .setTimestamp()
      .setImage(params?.image)
      .setURL(params?.url)
      .setFooter({
        text: 'Made with ❤️ by Ririko',
      });
  }
}
