import { CommandInterface } from '#command/command.interface';
import {
  DiscordInteraction,
  DiscordMessage,
  SlashCommandOptionTypes,
} from '#command/command.types';
import { TwitchBaseCommand } from '#command/twitch/class/twitch-base.class';

export default class SubscribeCommand
  extends TwitchBaseCommand
  implements CommandInterface
{
  name = 'subscribe';
  description = 'Get notified for Twitch streams';
  regex = new RegExp(`^subscribe$|^subscribe (.+)$`, 'i');
  usageExamples = ['subscribe', 'subscribe <twitch username>'];
  category = 'twitch';

  slashOptions = [
    {
      name: 'streamer',
      description: 'The Twitch streamer to subscribe to',
      type: SlashCommandOptionTypes.String,
      required: true,
    },
  ];

  async runPrefix(message: DiscordMessage) {
    const streamerName = this.allParams;

    // check if streamerName is empty
    if (!streamerName) {
      return message.reply({
        embeds: [
          this.prepareEmbed({
            message: `Please provide a Twitch streamer name.\nCheck the help command (\`${await this.getGuildPrefix(message)}help subscribe\`) for more information.`,
            isError: true,
          }),
        ],
      });
    }

    const subscribed = await this.subscribe(
      message.guild.id,
      streamerName.toLowerCase(),
    );

    if (subscribed) {
      return message.reply({
        embeds: [
          this.prepareEmbed({
            message: `Successfully subscribed to ${streamerName}`,
          }),
        ],
      });
    } else {
      return message.reply({
        embeds: [
          this.prepareEmbed({
            message: `Failed to subscribe to ${streamerName}. 
            Please make sure that you have setup the Twitch notification channel first.`,
            isError: true,
          }),
        ],
      });
    }
  }

  async runSlash(interaction: DiscordInteraction) {
    const streamerName = interaction.options.getString('streamer');

    // check if streamerName is empty
    if (!streamerName) {
      return interaction.reply({
        embeds: [
          this.prepareEmbed({
            message:
              'Please provide a Twitch streamer name.\nCheck the help command (`/help subscribe`) for more information.',
            isError: true,
          }),
        ],
      });
    }

    const subscribed = await this.subscribe(
      interaction.guild.id,
      streamerName.toLowerCase(),
    );
    if (subscribed) {
      return interaction.reply({
        embeds: [
          this.prepareEmbed({
            message: `Successfully subscribed to ${streamerName}`,
          }),
        ],
      });
    } else {
      return interaction.reply({
        embeds: [
          this.prepareEmbed({
            message: `Failed to subscribe to ${streamerName}.
            Please make sure you haven't subscribed to that streamer first and you have setup the Twitch notification channel.`,
            isError: true,
          }),
        ],
      });
    }
  }

  async subscribe(guildId: string, streamerName: string): Promise<boolean> {
    try {
      // Check if streamer exists in db
      let streamer = await this.db.twitchStreamerRepository.findOne({
        where: {
          twitchUserId: streamerName,
        },
      });

      if (!streamer) {
        // Create new streamer
        streamer = this.db.twitchStreamerRepository.create({
          twitchUserId: streamerName,
        });
        await this.db.twitchStreamerRepository.save(streamer);
      }

      // Check if subscription exists
      let subscription = await this.db.streamSubscriptionRepository.findOne({
        where: {
          twitchUserId: streamerName,
          guild: {
            id: guildId,
          },
        },
      });

      if (subscription) {
        return false;
      }

      // Get channel for notifications
      const guildDB = await this.db.guildRepository.findOne({
        where: { id: guildId },
      });

      const channel = guildDB.configurations.find(
        (config) => config.name === 'twitch_channel',
      );

      if (!channel) {
        return false;
      }

      // Create new subscription
      subscription = this.db.streamSubscriptionRepository.create({
        twitchUserId: streamerName,
        channelId: channel.value,
        guild: {
          id: guildId,
        },
      });

      await this.db.streamSubscriptionRepository.save(subscription);
      return true;
    } catch (e) {
      console.log(e);
      return false;
    }
  }
}
