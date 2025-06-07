import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import { CommandModals, DiscordInteraction } from '#command/command.types';
import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

export default class SetupStableDiffusionApiCommand
  extends Command
  implements CommandInterface
{
  name = 'setup-stablediffusion-api';
  regex = new RegExp(
    '^setup-stablediffusion-api$|^setup-stablediffusion-api ',
    'i',
  );
  description = 'Setup StableDiffusion API (via Replicate.com)';
  category = 'stablediffusion';
  usageExamples = ['setup-stablediffusion-api --api-token <api-token>'];

  modals: CommandModals = {
    'setup-stablediffusion-api-modal': this.handleModalSubmit,
  };

  async runCli(input: string): Promise<any> {
    const args = this.parseCliArgs(input);
    if (!args['api-token']) {
      console.error(
        'API Token is required\n   Example: setup-stablediffusion-api --api-token <api-token>',
      );
      return;
    }

    await this.saveApiToken(args['api-token']);
    console.log('StableDiffusion API has been set for this bot: ');
    console.log(args);
  }

  async runSlash(interaction: DiscordInteraction): Promise<any> {
    const botOwnerId = process.env.BOT_OWNER_ID; // Ensure this is set in your environment variables
    if (interaction.user.id !== botOwnerId) {
      await interaction.reply({
        content: 'Only the bot owner can run this command.',
        ephemeral: true,
      });
      return;
    }

    // Create a modal for API token input
    const modal = new ModalBuilder()
      .setCustomId('setup-stablediffusion-api-modal')
      .setTitle('Setup StableDiffusion API');

    const apiTokenInput = new TextInputBuilder()
      .setCustomId('api-token')
      .setLabel('Enter your StableDiffusion API token')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(
      apiTokenInput,
    );

    modal.addComponents(actionRow);

    await interaction.showModal(modal);
  }

  async handleModalSubmit(interaction: DiscordInteraction): Promise<any> {
    const botOwnerId = process.env.BOT_OWNER_ID;
    if (interaction.user.id !== botOwnerId) {
      await interaction.reply({
        content: 'Only the bot owner can run this command.',
        ephemeral: true,
      });
      return;
    }

    const apiToken = (interaction as any).fields.getTextInputValue('api-token');
    if (!apiToken) {
      await interaction.reply({
        content: 'API Token is required.',
        ephemeral: true,
      });
      return;
    }

    await this.saveApiToken(apiToken);
    await interaction.reply({
      content: 'StableDiffusion API token has been successfully set.',
      ephemeral: true,
    });
  }

  async saveApiToken(apiToken: string): Promise<void> {
    let config = await this.db.configRepository.findOne({
      where: {
        applicationId: process.env.DISCORD_APPLICATION_ID,
      },
    });

    if (!config) {
      this.db.configRepository.create({
        applicationId: process.env.DISCORD_APPLICATION_ID,
        stableDiffusionApiToken: apiToken,
      });
    } else {
      config.stableDiffusionApiToken = apiToken;
    }

    await this.db.configRepository.save(config);
  }

  parseCliArgs(input: string): Record<string, string> {
    const args = input.split('--').slice(1);
    const result: Record<string, string> = {};

    args.forEach((arg) => {
      const [key, value] = arg.split(' ');
      result[key] = value;
    });

    return result;
  }
}
