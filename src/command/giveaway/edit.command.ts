import { CommandInterface } from '#command/command.interface';
import { Command } from '#command/command.class';
import {
  DiscordInteraction,
  DiscordMessage,
  SlashCommandOptionTypes,
} from '#command/command.types';
import { EmbedBuilder } from 'discord.js';
import ms from 'ms';

export default class EditCommand extends Command implements CommandInterface {
  name = 'giveaway-edit';
  description = 'Edit an existing giveaway';
  regex = new RegExp(`^giveaway-edit$|^giveaway edit$|^gedit$`, 'i');
  category = 'giveaway';
  usageExamples = ['giveaway-edit', 'giveaway edit', 'gedit'];

  slashOptions = [
    {
      name: 'message_id',
      description: 'The message ID of the giveaway to edit.',
      type: SlashCommandOptionTypes.String,
      required: true,
    },
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
      description:
        'Enter a new duration. Example: 1d, 1h, 1m, 1s, OR -1d, -1h, -1m, -1s to reduce time.',
      type: SlashCommandOptionTypes.String,
      required: true,
    },
  ];

  async runPrefix(message: DiscordMessage): Promise<void> {
    const messageId = this.allParams;
    await this.editGiveaway(message, messageId);
  }

  async runSlash(interaction: DiscordInteraction): Promise<void> {
    const messageId = interaction.options.getString('message_id');
    const prize = interaction.options.getString('prize');
    const winners = interaction.options.getInteger('winners');
    const duration = interaction.options.getString('duration');

    if (!messageId || !prize || !winners || !duration) {
      await this.sendErrorMessage(
        interaction,
        'Please provide all the required fields.',
      );
      return;
    }

    // edit
    await this.client.giveawaysManager.edit(messageId, {
      newWinnerCount: winners,
      newPrize: prize,
      addTime: ms(duration),
    });

    await interaction.reply('Giveaway edited successfully!');
  }

  async editGiveaway(
    message: DiscordMessage,
    messageId?: string,
  ): Promise<void> {
    if (
      !message.member.permissions.has('ManageMessages') &&
      !message.member.roles.cache.some((r) => r.name === 'Giveaways')
    ) {
      await message.reply(
        ':x: You need to have the manage messages permissions to edit giveaways.',
      );
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('Edit A Giveaway!')
      .setColor('#2F3136')
      .setFooter({
        text: `${this.client.user.username}`,
        iconURL: this.client.user.displayAvatarURL(),
      })
      .setTimestamp();

    const msg = await message.reply({
      embeds: [
        embed.setDescription(
          "Which Giveaway Would You Like To Edit?\nProvide The Giveaway Message's ID\n **Must Reply within 30 seconds!**",
        ),
      ],
    });

    const filter = (m) => m.author.id === message.author.id && !m.author.bot;
    const collector = message.channel.createMessageCollector({
      filter,
      time: 30000,
    });

    collector.on('collect', async (collect) => {
      const response = collect.content;
      await collect?.delete();

      if (
        !this.client.giveawaysManager.giveaways.find(
          (g) => g.messageId === response,
        )
      ) {
        await msg.edit({
          embeds: [
            embed.setDescription(
              'Uh-Oh! Looks like you provided an Invalid Message ID!\n**Try Again?**\n Example: `677813783523098627`',
            ),
          ],
        });
        return;
      }

      collector.stop();
      await this.collectNewTime(message, embed, msg, response);
    });

    collector.on('end', (collected, reason) => {
      if (reason === 'time') {
        this.sendTimeoutMessage(message);
      }
    });
  }

  async collectNewTime(message, embed, msg, giveawayId) {
    await msg.edit({
      embeds: [
        embed.setDescription(
          'Alright! Next, What Would be our new time for the giveaway to be ended \n** Must Reply within 30 seconds!**',
        ),
      ],
    });

    const filter = (m) => m.author.id === message.author.id && !m.author.bot;
    const collector = message.channel.createMessageCollector({
      filter,
      time: 30000,
    });

    collector.on('collect', async (collect) => {
      const duration = ms(collect.content);
      await collect?.delete();

      if (!duration) {
        await msg.edit({
          embeds: [
            embed.setDescription(
              'Aw Snap! Looks Like You Provided Me With An Invalid Duration\n**Try Again?**\n Example: `-10 minutes`, `-10m`, `-10`\n **Note: - (minus) Indicates you want to reduce the time!**',
            ),
          ],
        });
        return;
      }

      collector.stop();
      await this.collectNewWinners(message, embed, msg, giveawayId, duration);
    });

    collector.on('end', (collected, reason) => {
      if (reason === 'time') {
        this.sendTimeoutMessage(message);
      }
    });
  }

  async collectNewWinners(message, embed, msg, giveawayId, duration) {
    await msg.edit({
      embeds: [
        embed.setDescription(
          'Alright! Next, How many winners should I roll for the giveaway now?\n**Must Reply within 30 seconds.**',
        ),
      ],
    });

    const filter = (m) => m.author.id === message.author.id && !m.author.bot;
    const collector = message.channel.createMessageCollector({
      filter,
      time: 30000,
    });

    collector.on('collect', async (collect) => {
      const winnersCount = parseInt(collect.content);
      await collect?.delete();

      if (isNaN(winnersCount) || winnersCount < 1) {
        await msg.edit({
          embeds: [
            embed.setDescription(
              'Boi! Winners Must Be A Number or greater than equal to one!\n**Try Again?**\n Example `1`, `10`, etc.',
            ),
          ],
        });
        return;
      }

      collector.stop();
      await this.collectNewPrize(
        message,
        embed,
        msg,
        giveawayId,
        duration,
        winnersCount,
      );
    });

    collector.on('end', (collected, reason) => {
      if (reason === 'time') {
        this.sendTimeoutMessage(message);
      }
    });
  }

  async collectNewPrize(
    message,
    embed,
    msg,
    giveawayId,
    duration,
    winnersCount,
  ) {
    await msg.edit({
      embeds: [
        embed.setDescription(
          'Alright, Generous Human! Next, What should be the new prize for the giveaway?\n**Must Reply within 30 seconds!**',
        ),
      ],
    });

    const filter = (m) => m.author.id === message.author.id && !m.author.bot;
    const collector = message.channel.createMessageCollector({
      filter,
      time: 30000,
    });

    collector.on('collect', async (collect) => {
      const prize = collect.content;
      await collect?.delete();

      collector.stop();
      await this.client.giveawaysManager.edit(giveawayId, {
        newWinnerCount: winnersCount,
        newPrize: prize,
        addTime: duration,
      });

      await msg.edit({
        embeds: [embed.setDescription('Giveaway edited successfully!')],
      });
    });

    collector.on('end', (collected, reason) => {
      if (reason === 'time') {
        this.sendTimeoutMessage(message);
      }
    });
  }

  async sendTimeoutMessage(message) {
    const embed = new EmbedBuilder()
      .setTitle('Oops! Looks Like We Met A Timeout! 🕖')
      .setColor('#FF0000')
      .setDescription(
        '💥 Snap our luck!\nYou took too much time to decide!\nUse `giveaway-edit` again to edit a giveaway!\nTry to respond within **30 seconds** this time!',
      )
      .setFooter({
        text: `${this.client.user.username}`,
        iconURL: this.client.user.displayAvatarURL(),
      })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  }

  async sendErrorMessage(
    message: DiscordMessage | DiscordInteraction,
    content: string,
  ): Promise<void> {
    const embed = new EmbedBuilder()
      .setTitle('Error')
      .setDescription(content)
      .setColor('#ff0000');
    await message.reply({ embeds: [embed] });
  }
}
