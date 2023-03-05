const { Client, Message, MessageEmbed, EmbedBuilder } = require("discord.js");
const { searchAnime } = require("tools/anime.js");
const { getLang } = require("helpers/language");

module.exports = {
  config: {
    name: "anime",
    cooldown: 2000,
    category: "Anime",
    usage: "anime [anime name]",
    description: "Get an anime descrption about a query",
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
    const anime = await searchAnime(query, 1).then((res) => {
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
      .setTitle("Name: " + anime.titles.english)
      .addFields(
        {
          name: "Titles: ",
          value:
            (anime.titles.english
              ? `➥ English: ${anime.titles.english}\n`
              : "➥ English: ❌\n") +
            `➥ Romaji: ${anime.titles.romaji}\n` +
            `➥ Japanese: ${anime.titles.japanese}`,
          inline: true,
        },
        {
          name: "Ratings: ",
          value:
            `➥ Watchers: ${anime.userCount}\n` +
            `➥ Favourites: ${anime.favoritesCount}\n` +
            `➥ Ratings: ${anime.averageRating} ⭐`,
          inline: true,
        },
        {
          name: "Synopsis: ",
          value: trim(anime.synopsis),
          inline: false,
        },
        lang.field1
      )
      .setThumbnail(anime.posterImage.original)
      .setTimestamp()
      .setFooter({ text: lang.footer1 });

    await message.reply({ embeds: [embed] });
  },
};
