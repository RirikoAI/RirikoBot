import {Injectable} from '@nestjs/common';
import {EmbedBuilder} from 'discord.js';
import {Command} from '#command/command.class';
import {CommandInterface} from '#command/command.interface';
import {DiscordInteraction, DiscordMessage} from '#command/command.types';

/**
 * Ping command.
 * @description Use this as a template for creating new commands.
 * @category Command
 */
@Injectable()
export default class CoinFlipCommand extends Command implements CommandInterface {
  name = 'coin-flip';
  regex = new RegExp(`^coin-flip$`, 'i');
  description = 'Flip a coin';
  category = 'games';
  usageExamples = [`coin-flip`];

  async runPrefix(message: DiscordMessage): Promise<void> {
// coinflip
    const coin = Math.random() > 0.5 ? 'Heads' : 'Tails';
    const embed = new EmbedBuilder()
      .setTitle('Coin Flip')
      .setDescription(`You flipped a coin and it landed on ${coin}`)
      .setColor('#0099ff')
      .setTimestamp();
    await message.reply({embeds: [embed]});
  }

  async runSlash(interaction: DiscordInteraction): Promise<void> {
    // coinflip
    const coin = Math.random() > 0.5 ? 'Heads' : 'Tails';
    const embed = new EmbedBuilder()
      .setTitle('Coin Flip')
      .setDescription(`You flipped a coin and it landed on ${coin}`)
      .setColor('#0099ff')
      .setTimestamp();
    await interaction.reply({embeds: [embed]});

  }

}
