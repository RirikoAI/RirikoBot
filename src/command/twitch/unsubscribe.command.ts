import { CommandInterface } from '#command/command.interface';
import {
  DiscordInteraction,
  DiscordMessage,
  SlashCommandOptionTypes,
} from '#command/command.types';
import { TwitchBaseCommand } from '#command/twitch/class/twitch-base.class';

export default class UnsubscribeCommand
  extends TwitchBaseCommand
  implements CommandInterface
{
  name = 'unsubscribe';
  description = 'Unsubscribe from a Twitch streamer';
  regex = new RegExp(`^unsubscribe$|^unsubscribe (.+)$`, 'i');
  usageExamples = ['unsubscribe', 'unsubscribe <twitch username>'];
  category = 'twitch';

  slashOptions = [
    {
      name: 'streamer',
      description: 'The Twitch streamer to unsubscribe',
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
            message: `Please provide a Twitch streamer name.\nCheck the help command (\`${await this.getGuildPrefix(message)}help unsubscribe\`) for more information.`,
            isError: true,
          }),
        ],
      });
    }

    const unsubscribed = await this.unsubscribe(message.guild.id, streamerName);

    if (unsubscribed) {
      return message.reply({
        embeds: [
          this.prepareEmbed({
            message: `Successfully unsubscribed from ${streamerName}`,
          }),
        ],
      });
    } else {
      return message.reply({
        embeds: [
          this.prepareEmbed({
            message: `Failed to unsubscribe from ${streamerName}.`,
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
              'Please provide a Twitch streamer name.\nCheck the help command (`/help unsubscribe`) for more information.',
            isError: true,
          }),
        ],
      });
    }

    const unsubscribed = await this.unsubscribe(
      interaction.guild.id,
      streamerName,
    );
    if (unsubscribed) {
      return interaction.reply({
        embeds: [
          this.prepareEmbed({
            message: `Successfully unsubscribed from ${streamerName}`,
          }),
        ],
      });
    } else {
      return interaction.reply({
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

  async unsubscribe(guildId: string, streamerName: string): Promise<boolean> {
    try {
      // Check if streamer exists in db
      const streamer = await this.db.twitchStreamerRepository.findOne({
        where: {
          twitchUserId: streamerName,
        },
      });

      if (!streamer) {
        return false;
      }

      // Check if subscription exists
      const subscription = await this.db.streamSubscriptionRepository.findOne({
        where: {
          twitchUserId: streamerName,
          guild: {
            id: guildId,
          },
        },
      });

      if (!subscription) {
        return false;
      }

      // Remove subscription
      await this.db.streamSubscriptionRepository.remove(subscription);

      return true;
    } catch (e) {
      console.log(e);
      return false;
    }
  }
}
