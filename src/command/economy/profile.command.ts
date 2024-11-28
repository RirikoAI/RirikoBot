import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import {
  DiscordInteraction,
  DiscordMessage,
  SlashCommandOptionTypes,
} from '#command/command.types';

export default class ProfileCommand
  extends Command
  implements CommandInterface
{
  name = 'profile';
  description = 'View your profile';
  regex = new RegExp(`^profile$`, 'i');
  category = 'economy';
  usageExamples = ['profile'];

  userMenuOption = {
    name: 'View Profile',
  };

  slashOptions = [
    {
      name: 'set-banner',
      description: 'Set the banner for your profile',
      type: SlashCommandOptionTypes.Subcommand,
      options: [
        {
          name: 'url',
          description: 'The URL of the image to use as your banner',
          type: SlashCommandOptionTypes.String,
          required: true,
        },
      ],
    },
    {
      name: 'view',
      description: 'View your profile',
      type: SlashCommandOptionTypes.Subcommand,
      options: [
        {
          name: 'user',
          description: 'The user to view',
          type: SlashCommandOptionTypes.User,
          required: false,
        },
      ],
    },
  ];

  async runPrefix(message: DiscordMessage): Promise<void> {
    await this.economy.getProfile(message.author, message.channel, message);
  }

  async runSlash(interaction: DiscordInteraction): Promise<void> {
    // get the subcommand
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'set-banner':
        // get the url
        const url = interaction.options.getString('url', true);
        // check if the url is an image by checking the file content type
        const isImage = await this.isImage(url);
        if (!isImage) {
          await interaction.reply({
            content: 'The URL provided is not an image.',
            ephemeral: true,
          });
          return;
        }
        await this.economy.setBackgroundImageURL(interaction.user, url);
        // send a message
        await interaction.reply({
          content: 'Your banner has been set!',
          ephemeral: true,
        });

        break;
      default:
      case 'view':
        // get the user
        const user = interaction?.options?.getUser('user') || interaction.user;
        await this.economy.getProfile(user, interaction.channel, interaction);
        break;
    }
  }

  async runUserMenu(interaction: any): Promise<void> {
    await this.economy.getProfile(
      interaction.targetUser,
      interaction.channel,
      interaction,
    );
  }

  async isImage(url: string): Promise<boolean> {
    const response = await fetch(url);
    const contentType = response.headers.get('content-type');
    return contentType?.startsWith('image');
  }
}
