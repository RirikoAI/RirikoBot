import { Command } from '#command/command.class';
import { CommandInterface } from '#command/command.interface';
import { DiscordInteraction, DiscordMessage } from '#command/command.types';
import { WaifuImService } from '#command/anime/waifu-im/waifu-im.service';
import { EmbedBuilder } from 'discord.js';
import { WaifuImResults } from '#command/anime/waifu-im/waifu-im.types';

export default class WaifuCommand extends Command implements CommandInterface {
  name = 'waifu';
  description = 'Get a random waifu image';
  category = 'anime';
  usageExamples = ['waifu'];
  regex = new RegExp(`^waifu$`, 'i');

  async runPrefix(message: DiscordMessage): Promise<any> {
    const waifu = await this.getRandomWaifuImage();
    const embed = await this.prepareEmbed({ waifu });

    return message.channel.send({ embeds: [embed] });
  }

  async runSlash(interaction: DiscordInteraction): Promise<any> {
    const waifu = await this.getRandomWaifuImage();
    const embed = await this.prepareEmbed({ waifu });

    return interaction.reply({ embeds: [embed] });
  }

  async getRandomWaifuImage(): Promise<any> {
    return await new WaifuImService().getRandomSelfies();
  }

  async prepareEmbed(params: { waifu: WaifuImResults }): Promise<any> {
    const embed = new EmbedBuilder()
      .setTitle('Random Waifu Image')
      .setColor('#FF00FF')
      .setImage(params.waifu.images[0].url)
      .setURL(params.waifu.images[0].source)
      .setFields([
        {
          name: 'Tags',
          value: params.waifu.images[0].tags.map((tag) => tag.name).join(', '),
          inline: true,
        },
        {
          name: 'Favorites',
          value: params.waifu.images[0].favorites.toString(),
          inline: true,
        },
      ])
      .setTimestamp()
      .setFooter({
        text: 'Made with ❤️ by Ririko',
      });

    if (params.waifu.images[0].artist) {
      embed.setAuthor({
        name: params.waifu.images[0].artist.name + ' via Waifu.im',
        url:
          params.waifu.images[0].artist.deviant_art ||
          params.waifu.images[0].artist.pixiv ||
          params.waifu.images[0].artist.patreon ||
          params.waifu.images[0].artist.twitter ||
          undefined,
      });
    } else {
      embed.setAuthor({
        name: 'via Waifu.im',
        url: 'https://waifu.im',
      });
    }

    return embed;
  }
}
