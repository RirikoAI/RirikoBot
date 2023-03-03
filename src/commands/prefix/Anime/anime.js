const { Client, Message, MessageEmbed, EmbedBuilder } = require("discord.js");
const { searchAnime } = require("tools/anime.js");
const { getLang } = require("utils/language");

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
   * @param {Client} client
   * @param {Message} message
   * @param {String[]} args
   */
  run: async (client, message, args) => {
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
