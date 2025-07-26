import { CommandInterface } from '#command/command.interface';
import {
  DiscordInteraction,
  DiscordMessage,
  SlashCommandOptionTypes,
} from '#command/command.types';
import { TwitchBaseCommand } from '#command/twitch/class/twitch-base.class';

export default class SetupTwitchCommand
  extends TwitchBaseCommand
  implements CommandInterface
{
  name = 'setup-twitch';
  description = 'Setup Twitch notification channel on your server';
  regex = new RegExp(`^setup-twitch$|^setup-twitch (.+)$`, 'i');
  usageExamples = ['setup-twitch', 'setup-twitch <channel>'];
  category = 'twitch';

  slashOptions = [
    {
      name: 'channel',
      description: 'The channel to send Twitch notifications',
      type: SlashCommandOptionTypes.Channel,
      required: true,
    },
  ];

  async runPrefix(message: DiscordMessage) {
    const channel = message.mentions.channels.first();
    if (!channel) {
      return message.reply({
        embeds: [
          this.prepareEmbed({
            message: 'Please mention a channel',
            isError: true,
          }),
        ],
      });
    }

    await this.setupTwitchChannel(message.guild.id, channel.id);
    return message.reply({
      embeds: [
        this.prepareEmbed({
          message: `Twitch notification channel set to ${channel}`,
        }),
      ],
    });
  }

  async runSlash(interaction: DiscordInteraction) {
    const channel = interaction.options.getChannel('channel');
    if (!channel) {
      return interaction.reply({
        embeds: [
          this.prepareEmbed({
            message: 'Please mention a channel',
            isError: true,
          }),
        ],
      });
    }

    await this.setupTwitchChannel(interaction.guildId, channel.id);
    return interaction.reply({
      embeds: [
        this.prepareEmbed({
          message: `Twitch notification channel set to ${channel}`,
        }),
      ],
    });
  }

  async setupTwitchChannel(guildId, channelId) {
    const guildDB = await this.db.guildRepository.findOne({
      where: { id: guildId },
    });

    const twitchChannel = guildDB.configurations.find(
      (config) => config.name === 'twitch_channel',
    );

    if (twitchChannel) {
      twitchChannel.value = channelId;
      await this.db.guildConfigRepository.save(twitchChannel);
    } else {
      await this.db.guildConfigRepository.save({
        name: 'twitch_channel',
        value: channelId,
        guild: guildDB,
      });
    }

    // find existing subscriptions and update the channel
    const subscriptions = await this.db.streamSubscriptionRepository.find({
      where: {
        guild: {
          id: guildId,
        },
      },
    });

    for (const subscription of subscriptions) {
      subscription.channelId = channelId;
      await this.db.streamSubscriptionRepository.save(subscription);
    }
  }
}
