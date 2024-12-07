import { EmbedBuilder } from 'discord.js';
import { Command } from '#command/command.class';

export abstract class TwitchBaseCommand extends Command {
  prepareEmbed(params: { message: string; isError?: boolean }): EmbedBuilder {
    let embed;
    if (params.isError) {
      embed = new EmbedBuilder()
        .setTitle('Ririko Twitch Service')
        .setDescription(params.message)
        .setFooter({
          text: 'Made with ❤️ by the Ririko',
        })
        .setColor('#ff0000')
        .setTimestamp();
    } else {
      embed = new EmbedBuilder()
        .setTitle('Ririko Twitch Service')
        .setDescription(params.message)
        .setFooter({
          text: 'Made with ❤️ by the Ririko',
        })
        .setColor('#00ff00')
        .setTimestamp();
    }

    return embed;
  }
}
