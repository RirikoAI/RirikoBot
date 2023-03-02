const { Client, Message, MessageEmbed, EmbedBuilder } = require("discord.js");
const { searchManga } = require("tools/anime.js");
const { getLang } = require("utils/language");

module.exports = {
  config: {
    name: "manga",
    cooldown: 2000,
    category: "Anime",
    usage: "manga [manga name]",
    description: "Get a manga description about a query",
  },
  owner: false,
  /**
   * @param {Client} client
   * @param {Message} message
   * @param {String[]} args
   */
  run: async (client, message, args) => {
    const lang = getLang();
    const query = args.join(" ");
    if (!query) return message.reply("Please type a name of an anime!");
    const manga = await searchManga(query, 1).then((res) => {
      return res[0];
    });

    function trim(input) {
      return input.length > 1024 ? `${input.slice(0, 1015)} [...]` : input;
    }

    const embed = new EmbedBuilder()
      .setColor("Random")
      .setAuthor({
        name: "Manga Finder",
        iconURL:
          "https://cdn.myanimelist.net/img/sp/icon/apple-touch-icon-256.png",
      })
      .setTitle("Type: " + manga.subType)
      .setThumbnail(manga.posterImage.original)
      .addFields(
        {
          name: "Titles: ",
          value:
            manga.titles?.en ||
            manga.titles?.enJp ||
            manga.titles?.abbreviatedTitles[0] + " ",
          inline: true,
        },
        {
          name: "Ratings: ",
          value:
            `➥ Readers: ${manga.userCount}\n` +
            `➥ Favourites: ${manga.favoritesCount}\n` +
            `➥ Ratings: ${manga.averageRating} ⭐`,
          inline: true,
        },
        {
          name: "Synopsis: ",
          value: trim(manga.synopsis),
          inline: false,
        }
      )
      .setTimestamp()
      .setFooter({ text: lang.footer1 });

    await message.reply({ embeds: [embed] });
  },
};
