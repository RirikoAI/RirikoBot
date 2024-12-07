import { TwitchBaseCommand } from '#command/twitch/class/twitch-base.class';
import { CommandInterface } from '#command/command.interface';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';

export default class TwitchStatusCommand
  extends TwitchBaseCommand
  implements CommandInterface
{
  name = 'twitch-status';
  description = 'Check the Twitch subscriptions and channel on your server';
  regex = new RegExp(`^twitch-status$`, 'i');
  usageExamples = ['twitch-status'];
  category = 'twitch';

  async runPrefix(message: DiscordMessage) {
    const { channel, streamers } = await this.getTwitchChannel(
      message.guild.id,
    );

    const embed = this.prepareEmbed({
      message: `Twitch notification channel: ${channel ? `<#${channel}>` : 'Not set'}`,
    });

    if (streamers.length > 0) {
      embed.addFields({
        name: 'Subscriptions',
        value: streamers.map((sub) => sub.twitchUserId).join(', '),
      });
    } else {
      embed.addFields({
        name: 'Subscriptions',
        value: 'No subscriptions',
      });
    }

    return message.reply({
      embeds: [embed],
    });
  }

  async runSlash(interaction: DiscordInteraction) {
    const { channel, streamers } = await this.getTwitchChannel(
      interaction.guildId,
    );

    const embed = this.prepareEmbed({
      message: `Twitch notification channel: ${channel ? `<#${channel}>` : 'Not set'}`,
    });

    if (streamers.length > 0) {
      embed.addFields({
        name: 'Subscriptions',
        value: streamers.map((sub) => sub.twitchUserId).join(', '),
      });
    } else {
      embed.addFields({
        name: 'Subscriptions',
        value: 'No subscriptions',
      });
    }

    return interaction.reply({
      embeds: [embed],
    });
  }

  async getTwitchChannel(guildId: string) {
    const guildDB = await this.db.guildRepository.findOne({
      where: { id: guildId },
    });

    const streamers = await this.db.streamSubscriptionRepository.find({
      where: {
        guild: {
          id: guildId,
        },
      },
    });

    return {
      channel: guildDB?.configurations?.find(
        (config) => config.name === 'twitch_channel',
      )?.value,
      streamers,
    };
  }
}
