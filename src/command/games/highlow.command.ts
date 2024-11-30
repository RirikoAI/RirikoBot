import {EmbedBuilder} from "discord.js";
import {DiscordInteraction, DiscordMessage} from "#command/command.types";
import {Command} from "#command/command.class";
import {CommandInterface} from "#command/command.interface";

/**
 * HighLowCommand
 * Guess if the next number is higher or lower
 * @category Commands: Games
 * @author 00ZenDaniel
 */

export default class HighLowCommand extends Command implements CommandInterface {
  name = 'high-low';
  regex = new RegExp(`^high-low$`, 'i');
  description = 'Guess if the next number is higher or lower';
  category = 'games';
  usageExamples = [`high-low`];

  async runPrefix(message: DiscordMessage): Promise<void> {
    // .high-low
    const number = Math.floor(Math.random() * 100) + 1;
    const nextNumber = Math.floor(Math.random() * 100) + 1;
    const embed = new EmbedBuilder()
      .setTitle('High Low')
      .setDescription(`The number is ${number}. Will the next number be higher or lower?`)
      .setColor('#0099ff')
      .setTimestamp();
    await message.reply({embeds: [embed]});

    const filter = (response: DiscordMessage) => {
      return response.author.id === message.author.id;
    };

    const collector = message.channel.createMessageCollector({filter, time: 15000, max: 1});

    collector.on('collect', async (response) => {
      let result: string;
      if (nextNumber > number) {
        result = 'higher';
      } else if (nextNumber < number) {
        result = 'lower';
      } else {
        result = 'the same';
      }

      const embed = new EmbedBuilder()
        .setTitle('High Low')
        .setDescription(`The number is ${nextNumber}. It was ${result} than ${number}`)
        .setColor('#0099ff')
        .setTimestamp();
      await response.reply({embeds: [embed]});
    });

    collector.on('end', async (collected, reason) => {
      if (reason === 'time') {
        const embed = new EmbedBuilder()
          .setTitle('High Low')
          .setDescription('You took too long to guess')
          .setColor('#0099ff')
          .setTimestamp();
        await message.reply({embeds: [embed]});
      }
    });
  }

  async runSlash(interaction: DiscordInteraction): Promise<void> {
    // high-low
    const number = Math.floor(Math.random() * 100) + 1;
    const nextNumber = Math.floor(Math.random() * 100) + 1;
    const embed = new EmbedBuilder()
      .setTitle('High Low')
      .setDescription(`The number is ${number}. Will the next number be higher or lower?`)
      .setColor('#0099ff')
      .setTimestamp();
    await interaction.reply({embeds: [embed]});

    const filter = (response: DiscordMessage) => {
      return response.author.id === interaction.user.id;
    };

    const collector = interaction.channel.createMessageCollector({filter, time: 15000, max: 1});

    collector.on('collect', async (response) => {
      let result: string;
      if (nextNumber > number) {
        result = 'higher';
      } else if (nextNumber < number) {
        result = 'lower';
      } else {
        result = 'the same';
      }

      const embed = new EmbedBuilder()
        .setTitle('High Low')
        .setDescription(`The number is ${nextNumber}. It was ${result} than ${number}`)
        .setColor('#0099ff')
        .setTimestamp();
      await response.reply({embeds: [embed]});
    });

    collector.on('end', async (collected, reason) => {
      if (reason === 'time') {
        const embed = new EmbedBuilder()
          .setTitle('High Low')
          .setDescription('You took too long to guess')
          .setColor('#0099ff')
          .setTimestamp();
        await interaction.reply({embeds: [embed]});
      }
    });
  }
}