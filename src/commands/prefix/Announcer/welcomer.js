const { EmbedBuilder } = require("discord.js");
const config = require("config");
const imageChecker = require("tools/imageChecker");

module.exports = {
  config: {
    name: "welcomer",
    description: "Configure welcomer / new member announcer.",
    usage:
      "welcomer status\nwelcomer enable\nwelcomer disable\nwelcomer bg [background image]\nwelcomer channel [channel id]",
  },
  category: "Announcer",
  permissions: ["Administrator"],
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
    if (!args[0] || ((args[0] === "channel" || args[0] === "bg") && !args[1])) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Missing argument")
            .setDescription(`See **${prefix}info welcomer** for more info`),
        ],
      });
    }

    if (args[0] === "status") {
      const status = await db.get(`guild_enabled_welcomer_${message.guild.id}`),
        channelID = await db.get(
          `guild_welcomer_announce_channel_${message.guild.id}`
        );

      let channel;

      try {
        channel = await message.channel.guild.channels.fetch(channelID);
      } catch (e) {
        const enabled = await db.set(
          `guild_enabled_welcomer_${message.guild.id}`,
          true
        );

        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("Channel not found")
              .setDescription(`Please set the channel again`),
          ],
        });
      }

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
              `**Channel:** ${channel} \n**Enabled:** ${
                status || "False"
              }\n**Background URL**: \n${bgUrl} ${
                isDefault ? "(Default)" : ""
              }\n\nSee **${prefix}info welcomer** for more info`
            ),
        ],
      });
    }

    if (args[0] === "enable") {
      const channelID = await db.get(
          `guild_welcomer_announce_channel_${message.guild.id}`
        ),
        channel = await message.channel.guild.channels.fetch(channelID);

      console.info("channel", channel.id);

      if (!channel.id)
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("Channel not found")
              .setDescription(`Please check the channel id`),
          ],
        });

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

    if (args[0] === "channel") {
      let channelName;
      try {
        channelName = await message.channel.guild.channels.fetch(args[1]);

        if (!channelName) throw new Error("channel not found");

        const channel_id = await db.set(
          `guild_welcomer_announce_channel_${message.guild.id}`,
          args[1]
        );

        const embed = new EmbedBuilder()
          .setTitle("Success!")
          .setDescription(
            `${channelName} set as the channel for announcing new members.`
          )
          .setColor("Green");

        return message.reply({ embeds: [embed] });
      } catch (e) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("Channel not found")
              .setDescription(`Please check the channel id`),
          ],
        });
      }
    }

    if (args[0] === "bg") {
      const url = args[1];

      // Validate image
      try {
        const isValidImage = await imageChecker(url);

        if (isValidImage) {
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
      } catch (e) {
        return message.reply(
          `Something went wrong loading the image. Please check the source or try converting it to jpg`
        );
      }
    }
  },
};
