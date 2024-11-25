import { CommandInterface } from '#command/command.interface';
import { Command } from '#command/command.class';
import {
  DiscordInteraction,
  DiscordMessage,
  SlashCommandOptionTypes,
} from '#command/command.types';
import { EmbedBuilder, GuildTextBasedChannel } from 'discord.js';
import ms from 'ms';

export default class CreateCommand extends Command implements CommandInterface {
  name = 'giveaway-create';
  description = 'Create giveaways.';
  regex = new RegExp(`^giveaway create$|^giveaway-create$|^gcreate$`, 'i');
  category = 'giveaway';
  usageExamples = ['giveaway-create', 'giveaway create', 'gcreate'];

  slashOptions = [
    {
      name: 'prize',
      description: 'The item to be given away. Max 256 characters.',
      type: SlashCommandOptionTypes.String,
      required: true,
    },
    {
      name: 'winners',
      description: 'The number of winners. Must be a number greater than 0.',
      type: SlashCommandOptionTypes.Integer,
      required: true,
    },
    {
      name: 'duration',
      description: 'How long the giveaway will last. Example: 1d, 1h, 1m, 1s.',
      type: SlashCommandOptionTypes.String,
      required: true,
    },
    {
      name: 'channel',
      description:
        'The channel where the giveaway will be hosted. Mention the channel.',
      type: SlashCommandOptionTypes.Channel,
      required: true,
    },
  ];

  async runPrefix(message: DiscordMessage): Promise<void> {
    await this.createGiveaway(message);
  }

  async runSlash(interaction: DiscordInteraction): Promise<void> {
    const prize = interaction.options.getString('prize');
    const winners = interaction.options.getInteger('winners');
    const duration = interaction.options.getString('duration');
    const channel = interaction.options.getChannel('channel');

    const isValid = this.validateInputs(
      prize,
      winners,
      duration,
      channel,
      interaction,
    );

    if (!isValid) {
      interaction.reply('Please provide valid inputs.');
      return;
    }

    await this.sendGiveawayCreatedEmbed(prize, winners, duration, interaction);

    await this.client.giveawaysManager.start(channel, {
      duration: ms(duration),
      winnerCount: winners,
      prize: prize,
    });
  }

  async createGiveaway(message: DiscordMessage | DiscordInteraction) {
    let created = false;
    let prize = '';
    let winnerCount = null;
    let duration = null;
    let channel: GuildTextBasedChannel = null;

    if (
      !message.member.permissions.has('ManageMessages') &&
      !message.member.roles.cache.some((r) => r.name === 'Giveaways')
    ) {
      await message.reply(
        ':x: You need to have the manage messages permissions to edit giveaways.',
      );
      return;
    }

    await this.sendEmbed('Item', 'What item are you giving away?', message);
    const collector = message.channel.createMessageCollector({
      filter: (m) => m.author.id === message.member.user.id,
      time: 120000,
    });

    collector.on('collect', async (m) => {
      if (m.content === 'cancel') {
        await message.reply('Giveaway creation canceled.');
        collector.stop('canceled');
        return;
      }

      if (!prize) {
        if (!this.validatePrize(m.content, message)) return;
        prize = m.content;
        await this.sendEmbed(
          'Winners',
          'How many winners will there be?',
          message,
        );
        return;
      } else if (!winnerCount) {
        if (!this.validateWinners(m.content, message)) return;
        winnerCount = parseInt(m.content);
        await this.sendEmbed(
          'Duration',
          'How long will the giveaway last?',
          message,
        );
        return;
      } else if (!duration) {
        if (!this.validateDuration(m.content, message)) return;
        duration = m.content;
        await this.sendEmbed(
          'Channel',
          'Please mention the channel where should the giveaway be hosted.',
          message,
        );
        return;
      } else if (!channel) {
        if (!this.validateChannel(m, message)) return;
        channel = m.mentions.channels.first() as GuildTextBasedChannel;
      }

      await this.sendGiveawayCreatedEmbed(
        prize,
        winnerCount,
        duration,
        message,
      );

      await this.client.giveawaysManager.start(channel, {
        duration: ms(duration),
        winnerCount,
        prize,
      });
      created = true;

      collector.stop('completed');
    });

    collector.on('end', (collected, reason) => {
      if (reason === 'time' && !created) {
        message.reply(
          'You took too long to respond. The giveaway is not created. Please try again.',
        );
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

  async sendGiveawayCreatedEmbed(prize, winners, duration, message) {
    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor('#32353e')
          .setTitle('Giveaway Created')
          .setDescription(
            `**Item:** ${prize}\n**Winners:** ${winners}\n**Duration:** ${duration}`,
          )
          .setAuthor({
            name: `${message.member.user.tag}'s Giveaway`,
            iconURL: message.member.displayAvatarURL(),
          })
          .setFooter({
            text: 'Good luck!',
            iconURL: this.client.user.displayAvatarURL(),
          })
          .setTimestamp(),
      ],
    });
  }

  validateInputs(
    prize,
    winners,
    duration,
    channel,
    interaction: DiscordInteraction,
  ) {
    if (prize.length > 256) {
      interaction.reply(
        'The prize name is too long. Please provide a shorter name.',
      );
      return false;
    }

    if (isNaN(winners) || winners < 1) {
      interaction.reply('Please provide a valid number of winners.');
      return false;
    }

    if (!duration.match(/^(\d+[dhms])+$/)) {
      interaction.reply(
        'Please provide a valid duration. You can use the following format: 1d, 1h, 1m, 1s.',
      );
      return false;
    }

    if (!channel) {
      interaction.reply('Please mention a valid channel.');
      return false;
    }

    return true;
  }

  validatePrize(content, message) {
    if (content.length > 256) {
      message.reply(
        'The prize name is too long. Please provide a shorter name.',
      );
      return false;
    }
    return true;
  }

  validateWinners(content, message) {
    if (isNaN(parseInt(content)) || parseInt(content) < 1) {
      message.reply('Please provide a valid number of winners.');
      return false;
    }
    return true;
  }

  validateDuration(content, message) {
    if (!content.match(/^(\d+[dhms])+$/)) {
      message.reply(
        'Please provide a valid duration. You can use the following format: 1d, 1h, 1m, 1s.',
      );
      return false;
    }
    return true;
  }

  validateChannel(m, message) {
    if (!m.mentions.channels.first()) {
      message.reply('Please mention a valid channel.');
      return false;
    }
    return true;
  }
}
