const { EmbedBuilder } = require("discord.js");

module.exports = {
  config: {
    name: "leave-announcer",
    description: "Set/unset the leave announcer.",
    usage:
      "leave-announcer channel [channel id]\n" +
      "leave-announcer enable\n" +
      "leave-announcer disable\n" +
      "leave-announcer status",
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
   * @param prefix Guild specific prefix, falls back to config.ts prefix
   * @param {import("config")} config config.ts file
   * @param {import("Quick.db").QuickDB} db Quick.db client
   *
   * @returns {Promise<*>}
   */
  run: async (client, message, args, prefix, config, db) => {
    if (!args[0] || (args[0] === "channel" && !args[1])) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Missing argument")
            .setDescription(
              `See **${prefix}info leave-announcer** for command info`
            ),
        ],
      });
    }

    if (args[0] === "status") {
      let status = await db.get(`guild_leave_announce_${message.guild.id}`),
        channelID = await db.get(
          `guild_leave_announce_channel_${message.guild.id}`
        );

      let channelName;
      try {
        channelName = await message.channel.guild.channels.fetch(channelID);
      } catch (e) {
        channelName = "<unknown>";
      }

      if (status === null) {
        status = "Not Set";
      }

      if (channelID === null) {
        channelID = "";
        channelName = "Not Set";
      }

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Leave announcer")
            .setDescription(
              `Enabled: ${status}\nChannel: ${channelName} ${channelID}`
            ),
        ],
      });
    }

    if (args[0] === "enable") {
      const channelID = await db.get(
        `guild_leave_announce_channel_${message.guild.id}`
      );

      if (channelID === null) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("Leave announcer")
              .setDescription(
                `Please check your settings before enabling this feature`
              ),
          ],
        });
      }

      const enabled = await db.set(
        `guild_leave_announce_${message.guild.id}`,
        true
      );

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Leave announcer")
            .setDescription(
              `Leave announcer has been **enabled** for the server`
            ),
        ],
      });
    }

    if (args[0] === "disable") {
      const disabled = await db.set(
        `guild_leave_announce_${message.guild.id}`,
        false
      );

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Leave announcer")
            .setDescription(
              `Leave announcer has been **disabled** for the server`
            ),
        ],
      });
    }

    if (args[0] === "channel") {
      let channelName;
      try {
        channelName = await message.channel.guild.channels.fetch(args[1]);

        if (!channelName) throw new Error("Channel not found");

        const channel_id = await db.set(
          `guild_leave_announce_channel_${message.guild.id}`,
          args[1]
        );

        const embed = new EmbedBuilder()
          .setTitle("Success!")
          .setDescription(
            `${channelName} set as the channel for announcing leave.`
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
  },
};
