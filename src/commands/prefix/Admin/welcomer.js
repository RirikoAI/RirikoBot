const { EmbedBuilder } = require("discord.js");
const client = require("ririko");
const config = require("config");
const isImageURL = require("image-url-validator").default;

module.exports = {
  config: {
    name: "welcomer",
    description: "Set the prefix for the guild.",
    usage:
      "welcomer status\nwelcomer enable\nwelcomer disable\nwelcomer bg [background image]",
  },
  permissions: ["Administrator"],
  owner: false,
  run: async (client, message, args, prefix, config, db) => {
    if (!args[0] || (args[0] === "bg" && !args[1])) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Missing argument")
            .setDescription(`See **${prefix}info welcomer** for more info`),
        ],
      });
    }

    if (args[0] === "status") {
      const status = await db.get(`guild_enabled_welcomer_${message.guild.id}`);

      let bgUrl = await db.get(
        `guild_welcomer_welcomer_bg_${message.guild.id}`
      );

      let isDefault = false;

      if (!bgUrl) {
        bgUrl = config.welcomer.defaultImageUrl;
        isDefault = true;
      }

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Welcomer")
            .setThumbnail(bgUrl)
            .setDescription(
              `**Enabled:** ${
                status || "False"
              }\n**Background URL**: \n${bgUrl} ${
                isDefault ? "(Default)" : ""
              }\n\nSee **${prefix}info welcomer** for more info`
            ),
        ],
      });
    }

    if (args[0] === "enable") {
      const enabled = await db.set(
        `guild_enabled_welcomer_${message.guild.id}`,
        true
      );

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Welcomer")
            .setDescription(`Welcomer has been **enabled** for the server`),
        ],
      });
    }

    if (args[0] === "disable") {
      const disabled = await db.set(
        `guild_enabled_welcomer_${message.guild.id}`,
        false
      );

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Welcomer")
            .setDescription(`Welcomer has been **disabled** for the server`),
        ],
      });
    }

    if (args[0] === "bg") {
      const url = args[1];

      // Validate image
      try {
        isImageURL("https://github.com/BhanukaUOM/Image-Url-Validator").then(
          async (is_image) => {
            if (is_image) {
              const bg = await db.set(
                `guild_welcomer_welcomer_bg_${message.guild.id}`,
                url
              );

              return message.reply({
                embeds: [
                  new EmbedBuilder()
                    .setTitle("Welcomer")
                    .setThumbnail(bg)
                    .setDescription(`Welcomer bg has been set successfully`),
                ],
              });
            } else {
              return message.reply(
                `Error loading the image. Please check the source or try converting it to jpg`
              );
            }
          }
        );
      } catch (e) {
        return message.reply(
          `Something went wrong loading the image. Please check the source or try converting it to jpg`
        );
      }
    }
  },
};
