import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';

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

  async runPrefix(message: DiscordMessage): Promise<void> {
    await this.economy.getProfile(message.author, message.channel, message);
  }

  async runSlash(interaction: DiscordInteraction): Promise<void> {
    await this.economy.getProfile(
      interaction.user,
      interaction.channel,
      interaction,
    );
  }

  async runUserMenu(interaction: any): Promise<void> {
    await this.economy.getProfile(
      interaction.targetUser,
      interaction.channel,
      interaction,
    );
  }
}
