const { Client, Message, MessageEmbed, EmbedBuilder } = require("discord.js");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
} = require("discord.js");

const { AnimeWallpaper, AnimeSource } = require("anime-wallpaper");
const wallpaper = new AnimeWallpaper();

const { getLang } = require("helpers/language");
module.exports = {
  config: {
    name: "wallpaper",
    cooldown: 2000,
    usage: "wallpaper [anime name]",
    description: "Get an anime wallpaper with the query",
  },
  owner: false,
  category: "Anime",
  /**
   * Command runner
   * @author earnestangel https://github.com/RirikoAI/RirikoBot
   *
   * @param {import("discord.js").Client} client Discord.js client
   * @param {import("discord.js").Message | import("discord.js").CommandInteraction} message
   * @param args Arguments, excludes the command name (e.g: !command args[0] args[1] args[2]...)
   * @param prefix Guild specific prefix, falls back to config.ts prefix
   * @param {import("../../../../config/config")} config config.ts file
   * @param {import("Quick.db").QuickDB} db Quick.db client
   *
   * @returns {Promise<*>}
   */
  run: async (client, message, args, prefix, config, db) => {
    const lang = getLang();
    const query = args.join(" ");
    try {
      if (!query)
        return message.reply("Please give me an anime to search a wallpaper!");

      let wallpapers;

      try {
        wallpapers = await wallpaper.search(
          { title: query },
          AnimeSource.WallHaven
        );
      } catch (err) {
        console.error("Wallpaper error:", err);
        return message.reply(
          "❌ Sorry, I couldn't find any wallpaper with the keyword: " +
            query.toString()
        );
      }

      let bigImages = [];

      wallpapers.forEach((wallpaper, index, arr) => {
        if (wallpaper?.image?.startsWith("http")) {
          bigImages.push(wallpaper);
        }
      });

      const randomImage =
        bigImages[Math.floor(Math.random() * bigImages.length)];

      const embed = new EmbedBuilder()
        .setColor("Random")
        .setDescription(`Requested by: ${message.author.toString()}`)
        .setImage(randomImage.image)
        .addFields({
          name: "Full: ",
          value: randomImage.image,
        })
        .setTimestamp()
        .setURL(randomImage.image)
        .setFooter({ text: `${lang.footer1}` });

      await message.reply({
        embeds: [embed],
      });
    } catch (e) {
      return message.reply(
        "❌ Sorry, I couldn't find any wallpaper with the keyword: " +
          query.toString()
      );
    }
  },
};
