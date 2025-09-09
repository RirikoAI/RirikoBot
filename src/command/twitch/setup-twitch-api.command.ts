import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import { CommandModals, DiscordInteraction } from '#command/command.types';
import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { Logger } from '@nestjs/common';

export default class SetupTwitchApiCommand
  extends Command
  implements CommandInterface
{
  name = 'setup-twitch-api';
  regex = new RegExp('^setup-twitch-api$|^setup-twitch-api ', 'i');
  description = 'Setup Twitch API';
  category = 'twitch';
  usageExamples = [
    'setup-twitch-api --client-id <client-id> --client-secret <client-secret>',
  ];

  modals: CommandModals = {
    'setup-twitch-api-modal': this.handleModalSubmit,
  };

  async runCli(input: string): Promise<any> {
    const args = this.parseCliArgs(input);

    if (!args['client-id'] || !args['client-secret']) {
      Logger.error(
        'Client ID and Client Secret are required\n   Example: setup-twitch-api --client-id <client-id> --client-secret <client-secret>',
      );
      return;
    }

    await this.saveApiCredentials(args['client-id'], args['client-secret']);
    console.log('Twitch API configuration saved successfully:');
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

    // Create a modal for API credentials input
    const modal = new ModalBuilder()
      .setCustomId('setup-twitch-api-modal')
      .setTitle('Setup Twitch API');

    const clientIdInput = new TextInputBuilder()
      .setCustomId('client-id')
      .setLabel('Enter your Twitch Client ID')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const clientSecretInput = new TextInputBuilder()
      .setCustomId('client-secret')
      .setLabel('Enter your Twitch Client Secret')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const actionRow1 = new ActionRowBuilder<TextInputBuilder>().addComponents(
      clientIdInput,
    );
    const actionRow2 = new ActionRowBuilder<TextInputBuilder>().addComponents(
      clientSecretInput,
    );

    modal.addComponents(actionRow1, actionRow2);

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

    const clientId = (interaction as any).fields.getTextInputValue('client-id');
    const clientSecret = (interaction as any).fields.getTextInputValue(
      'client-secret',
    );

    if (!clientId || !clientSecret) {
      await interaction.reply({
        content: 'Both Client ID and Client Secret are required.',
        ephemeral: true,
      });
      return;
    }

    await this.saveApiCredentials(clientId, clientSecret);
    await interaction.reply({
      content: 'Twitch API credentials have been successfully set.',
      ephemeral: true,
    });
  }

  async saveApiCredentials(
    clientId: string,
    clientSecret: string,
  ): Promise<void> {
    let config = await this.db.configRepository.findOne({
      where: {
        applicationId: this.services.config.get<string>(
          'discord.discordApplicationId',
        ),
      },
    });

    if (!config) {
      config = this.db.configRepository.create({
        applicationId: this.services.config.get<string>(
          'discord.discordApplicationId',
        ),
        twitchClientId: clientId,
        twitchClientSecret: clientSecret,
      });
      await this.db.configRepository.save(config); // Save the new entity
    } else {
      config.twitchClientId = clientId;
      config.twitchClientSecret = clientSecret;
      await this.db.configRepository.save(config); // Save the updated entity
    }
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
