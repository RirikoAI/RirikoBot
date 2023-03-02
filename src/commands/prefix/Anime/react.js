const { EmbedBuilder } = require("discord.js");
const fs = require("fs");
const { getLang } = require("utils/language");
const { getJson } = require("utils/httpUtils");
const NekosLife = require("nekos.life");
const neko = new NekosLife();

const choices = [
  "hug",
  "kiss",
  "cuddle",
  "feed",
  "pat",
  "poke",
  "slap",
  "smug",
  "tickle",
  "wink",
];

const suffix = {
  hug: "hugged",
  kiss: "kissed",
  cuddle: "cuddled",
  feed: "fed",
  pat: "patted",
  poke: "poked",
  slap: "slapped",
  smug: "smugged at",
  tickle: "ticked",
  wink: "winked at",
};

module.exports = {
  config: {
    name: "react",
    description:
      "Send reaction anime images. Must be one of " + choices.join(", "),
    usage: "react [choice]",
  },
  owner: false,
  run: async (client, message, args, prefix) => {
    if (!args[0]) {
      return message.reply(
        `Invalid command. Try \`${prefix}react ${choices.join(", ")}\``
      );
    }

    const category = args[0].toLowerCase();
    if (!choices.includes(category)) {
      return message.reply(
        `Invalid choice: \`${category}\`.\nAvailable reactions: ${choices.join(
          ", "
        )}`
      );
    }

    let embed;
    if (args[1]) {
      embed = await genReaction(category, message.author, args[1]);
    } else {
      embed = await genReaction(category, message.author);
    }

    await message.reply({ embeds: [embed] });
  },
};

/**
 * @author saiteja-madha https://github.com/saiteja-madha/discord-js-bot
 * @param category
 * @param user
 * @returns {Promise<EmbedBuilder>}
 */
const genReaction = async (category, user, secondUser = false) => {
  try {
    let imageUrl;

    // some-random api
    if (category === "wink") {
      const response = await getJson("https://some-random-api.ml/animu/wink");
      if (!response.success) throw new Error("API error");
      imageUrl = response.data.link;
    }

    // neko api
    else {
      imageUrl = (await neko[category]()).url;
    }

    let response = new EmbedBuilder()
      .setImage(imageUrl)
      .setColor("Random")
      .setFooter({ text: `Requested By ${user.tag}` });

    if (secondUser) {
      response.setDescription(`${user} ${suffix[category]} ${secondUser}`);
    }

    return response;
  } catch (ex) {
    return new EmbedBuilder()
      .setColor("Red")
      .setDescription("Failed to fetch meme. Try again!")
      .setFooter({ text: `Requested By ${user.tag}` });
  }
};
