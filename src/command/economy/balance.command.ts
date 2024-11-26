import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { EmbedBuilder } from 'discord.js';

export default class BalanceCommand
  extends Command
  implements CommandInterface
{
  name = 'balance';
  description = 'Check your balance';
  regex = new RegExp(`^balance$|^bal$|^money$|^coins$`, 'i');
  category = 'economy';
  usageExamples = ['balance', 'bal', 'money', 'coins'];

  async runPrefix(message: DiscordMessage): Promise<void> {
    const coins = await this.economy.getBalance(message.author.id);

    // sendEmbed
    const embed = await this.prepareEmbed(coins);
    await message.channel.send({
      embeds: [embed],
    });
  }

  async runSlash(interaction: DiscordInteraction): Promise<void> {
    const coins = await this.economy.getBalance(interaction.user.id);

    // sendEmbed
    const embed = await this.prepareEmbed(coins);
    await interaction.reply({
      embeds: [embed],
    });
  }

  async prepareEmbed(coins) {
    const embed = new EmbedBuilder()
      .setTitle('Balance')
      .setDescription(`You have ${coins} coins`)
      .setColor('#00ff00')
      .setTimestamp()
      .setFooter({
        text: 'Ririko Economy | Made with ❤️ by Ririko',
      });

    return embed;
  }
}
