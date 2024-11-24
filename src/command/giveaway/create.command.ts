import { CommandInterface } from '#command/command.interface';
import { Command } from '#command/command.class';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { EmbedBuilder } from 'discord.js';

export default class CreateCommand extends Command implements CommandInterface {
  name = 'giveaway';
  description = 'Create giveaways.';
  regex = new RegExp(`^giveaway create$`);
  category = 'giveaway';
  usageExamples = ['giveaway create'];

  async runPrefix(message: DiscordMessage): Promise<void> {
    await this.createGiveaway(message);
  }

  async runSlash(interaction: DiscordInteraction): Promise<void> {
    await this.createGiveaway(interaction);
  }

  async createGiveaway(message: DiscordMessage | DiscordInteraction) {
    let created = false;
    let prize = '';
    let winners = null;
    let duration = null;

    // ask the user to provide the giveaway details, start with the item to be given away
    await this.sendEmbed('Item', 'What item are you giving away?', message);
    const collector = message.channel.createMessageCollector({
      filter: (m) => m.author.id === message.member.user.id,
      time: 120000,
    });

    collector.on('collect', async (m) => {
      if (m.content === 'cancel') {
        collector.stop('canceled');
        return;
      }

      if (!prize) {
        prize = m.content;
        await this.sendEmbed(
          'Winners',
          'How many winners will there be?',
          message,
        );
      } else if (!winners) {
        winners = parseInt(m.content);
        await this.sendEmbed(
          'Duration',
          'How long will the giveaway last?',
          message,
        );
      } else if (!duration) {
        // parse duration like 1d, 1h, 1m, 1s
        duration = m.content;
        // create start and end date
        const startDate = new Date();
        const endDate = new Date(startDate);
        const durationParts = duration.match(/(\d+)([dhms])/g);
        for (const part of durationParts) {
          const value = parseInt(part.match(/\d+/)[0]);
          const unit = part.match(/[dhms]/)[0];
          switch (unit) {
            case 'd':
              endDate.setDate(endDate.getDate() + value);
              break;
            case 'h':
              endDate.setHours(endDate.getHours() + value);
              break;
            case 'm':
              endDate.setMinutes(endDate.getMinutes() + value);
              break;
            case 's':
              endDate.setSeconds(endDate.getSeconds() + value);
              break;
          }
        }
        // create the giveaway
        collector.stop('completed');
      }

      await this.sendEmbed('Item', 'Select', message);
    });

    collector.on('end', (collected, reason) => {
      if (reason === 'time' && !created) {
        message.reply(
          'You took too long to respond. The giveaway is not created. Please try again.',
        );
      } else {
        created = false;
      }
    });
  }

  async sendEmbed(title, desc, message) {
    return await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor('#32353e')
          .setTitle('Giveaway: ' + title)
          .setDescription(desc)
          .setAuthor({
            name: `${message.author.tag}'s Giveaway Setup`,
            iconURL: message.member.displayAvatarURL(),
          })
          .setFooter({
            text: "Type 'cancel' to cancel the creation.",
            iconURL: this.client.user.displayAvatarURL(),
          })
          .setTimestamp(),
      ],
    });
  }
}
