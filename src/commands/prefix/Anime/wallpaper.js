const { Client, Message, MessageEmbed, EmbedBuilder } = require("discord.js");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Events,
} = require("discord.js");

const { AnimeWallpaper } = require("anime-wallpaper");
const wall = new AnimeWallpaper();
const { getLang } = require("utils/language");
const fetch = require("node-fetch");

module.exports = {
  config: {
    name: "wallpaper",
    cooldown: 2000,
    category: "Anime",
    usage: "wallpaper [anime name]",
    description: "Get an anime wallpaper with the query",
  },
  owner: false,
  run: async (client, message, args) => {
    try {
      const lang = getLang();
      const query = args.join(" ");
      if (!query)
        return message.reply("Please give me an anime to search a wallpaper!");

      let wallpapers;

      try {
        wallpapers = await Wallpaper1(query);
      } catch (err) {
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

      message.reply({
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

async function Wallpaper1(query) {
  let wallpaper = await wall.getAnimeWall5(query);
  return wallpaper;
}
