import {EmbedBuilder} from "discord.js";
import {DiscordInteraction, DiscordMessage} from "#command/command.types";
import {CommandInterface} from "#command/command.interface";
import {Command} from "#command/command.class";

/**
 * DiceCommand
 * Roll a dice
 * @category Commands: Games
 * @author 00ZenDaniel
 */

export default class DiceCommand extends Command implements CommandInterface {
  name = 'dice';
  regex = new RegExp(`^dice$`, 'i');
  description = 'Roll a dice';
  category = 'games';
  usageExamples = [`dice`];

  async runPrefix(message: DiscordMessage): Promise<void> {
    // .dice
    const dice = Math.floor(Math.random() * 6) + 1;
    const embed = new EmbedBuilder()
      .setTitle('Dice Roll')
      .setDescription(`You rolled a dice and it landed on ${dice}`)
      .setColor('#0099ff')
      .setTimestamp();
    await message.reply({embeds: [embed]});
  }

  async runSlash(interaction: DiscordInteraction): Promise<void> {
    // dice
    const dice = Math.floor(Math.random() * 6) + 1;
    const embed = new EmbedBuilder()
      .setTitle('Dice Roll')
      .setDescription(`You rolled a dice and it landed on ${dice}`)
      .setColor('#0099ff')
      .setTimestamp();
    await interaction.reply({embeds: [embed]});

  }

}