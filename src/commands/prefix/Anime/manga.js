const { Client, Message, MessageEmbed, EmbedBuilder } = require("discord.js");
const { searchManga } = require("tools/anime.js");
const { getLang } = require("helpers/language");

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
   * Command runner
   * @author earnestangel https://github.com/RirikoAI/RirikoBot
   *
   * @param {import("discord.js").Client} client Discord.js client
   * @param {import("discord.js").Message | import("discord.js").CommandInteraction} message
   * @param args Arguments, excludes the command name (e.g: !command args[0] args[1] args[2]...)
   * @param prefix Guild specific prefix, falls back to config.js prefix
   * @param {import("config")} config Config.js file
   * @param {import("Quick.db").QuickDB} db Quick.db client
   *
   * @returns {Promise<*>}
   */
  run: async (client, message, args, prefix, config, db) => {
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
        },
        lang.field1
      )
      .setTimestamp()
      .setFooter({ text: lang.footer1 });

    await message.reply({ embeds: [embed] });
  },
};
