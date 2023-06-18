/**
 * @author earnestangel https://github.com/RirikoAI/RirikoBot
 */
const { EmbedBuilder } = require("discord.js");
const config = require("config");
const imageChecker = require("tools/imageChecker");
const { getStreamersByGuildId } = require("app/Schemas/Streamer");
const { getSubscribersByGuildId } = require("app/Schemas/StreamSubscribers");
const { getLang } = require("helpers/language");
const { getSettings } = require("app/Schemas/Guild");
const { updateGuildOwner } = require("app/Schemas/Guild");
const { setSettings } = require("app/Schemas/Guild");
const {
  updateSubscription,
  deleteSubscription,
} = require("app/Schemas/StreamSubscribers");
const { addStreamersAndSubscribers } = require("app/RirikoTwitchManager");

module.exports = {
  config: {
    name: "twitch",
    description: "Configure twitch / new member announcer.",
    usage:
      "twitch status - See the status\n\n" +
      "twitch watch [Twitch Username] - Get notified when the streamer goes live\n\n" +
      "twitch unwatch [Twitch Username] - Stop notification from the streamer\n\n" +
      "twitch channel [channel id] - Set channel for notifications\n\n" +
      "twitch enable - Enable the stream notification\n\n" +
      "twitch disable - Disable the stream notification",
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
    await updateGuildOwner(message.guild);
    let settings = await getSettings(message.guild.id);
    // console.log("settings", settings);
    if (
      !args[0] ||
      ((args[0] === "watch" ||
        args[0] === "unwatch" ||
        args[0] === "channel") &&
        !args[1])
    ) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Missing argument")
            .setDescription(`See **${prefix}info twitch** for more info`),
        ],
      });
    }

    // fetch channel id and name
    let channelName;
    try {
      const channelID = settings?.twitch?.channel_id;
      if (channelID) {
        channelName = await message.channel.guild.channels.fetch(channelID);
      } else {
        channelName = "Not set";
      }
    } catch (e) {
      channelName = "<Unknown>";
    }

    if (args[0] === "status") {
      const streamers = await getSubscribersByGuildId(message.guild.id);
      let subscriptions = [];
      let descriptions = "";

      const embed = new EmbedBuilder()
        .setColor("#6441A5")
        .setTitle("Twitch Stream Notifier");

      if (streamers.length !== 0) {
        streamers.forEach((streamer) => {
          subscriptions.push(streamer.twitch_user_id);
        });
        descriptions += `List of subscriptions: ${subscriptions.join(
          ", "
        )}\n\n`;
      } else {
        descriptions += `List of subscriptions: None - Why don't you add some ^^\n Use ${prefix}info twitch for more info.\n\n`;
      }

      descriptions += `Notification Channel: ${channelName}\n\n`;
      descriptions += `Currently enabled: ${
        settings?.twitch?.enabled ? "Enabled" : "Disabled"
      }`;

      embed.setDescription(descriptions);
      embed.setTimestamp().setFooter({ text: `${getLang().footer1}` });
      return message.channel.send({ embeds: [embed] });
    }

    if (args[0] === "channel") {
      try {
        channelName = await message.channel.guild.channels.fetch(args[1]);

        if (!channelName) throw new Error("Channel not found");

        await setSettings(
          message.guild,
          "twitch",
          "channel_id",
          channelName.id
        );

        // update subscription and replace old channel_id with the new one
        await updateSubscription(message.guild.id, channelName.id);

        const embed = new EmbedBuilder()
          .setTitle("Success!")
          .setDescription(
            `${channelName} set as the channel for notifying Twitch streams.`
          )
          .setColor("Green");

        return message.reply({ embeds: [embed] });
      } catch (e) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("Channel not found")
              .setImage("https://i.imgur.com/xiIihhn.gif")
              .setDescription(
                `Please check the channel id. Right click on the Channel and click Copy Channel ID.\nIf you can't find the option, you need to enable developer mode.`
              ),
          ],
        });
      }
    }

    if (args[0] === "watch") {
      try {
        await updateSubscription(message.guild.id, channelName.id);
        await addStreamersAndSubscribers(
          [args[1].toLowerCase()],
          message.guild.id,
          channelName.id
        );
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("Notification has been added")
              .setDescription(
                `You will now be notified when ${args[1]} is live.`
              ),
          ],
        });
      } catch (e) {
        console.log("Error", e);
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("Something went wrong")
              .setDescription(
                `Cannot add the stream notification. Please contact the bot developer.`
              ),
          ],
        });
      }
    }

    if (args[0] === "unwatch") {
      try {
        await deleteSubscription(message.guild.id, args[1]);
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("Streamer removed successfully")
              .setDescription(
                `You will no longer be notified when the streamer goes live.`
              ),
          ],
        });
      } catch (e) {
        console.log("Error", e);
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("Something went wrong")
              .setDescription(
                `Cannot delete the streamer notification. Please contact the bot developer.`
              ),
          ],
        });
      }
    }

    if (args[0] === "enable") {
      try {
        await setSettings(message.guild, "twitch", "enabled", true);
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("Twitch Stream Notification")
              .setDescription(
                `Notification enabled for the server ${message.guild}, in channel: ${channelName}`
              ),
          ],
        });
      } catch (e) {
        console.log("Error", e);
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("Something went wrong")
              .setDescription(
                `Cannot enable Twitch notification. Please contact the bot developer.`
              ),
          ],
        });
      }
    }

    if (args[0] === "disable") {
      try {
        await setSettings(message.guild, "twitch", "enabled", false);
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("Twitch Stream Notification")
              .setDescription(
                `Notification disabled for the server ${message.guild}, in channel: ${channelName}`
              ),
          ],
        });
      } catch (e) {
        console.log("Error", e);
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("Something went wrong")
              .setDescription(
                `Cannot disable Twitch notification. Please contact the bot developer.`
              ),
          ],
        });
      }
    }

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("Invalid argument (typo?)")
          .setDescription(`See **${prefix}info twitch** for more info`),
      ],
    });
  },
};
