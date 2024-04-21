const {
  EmbedBuilder,
  InteractionType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require("discord.js");
const client = require("ririkoBot");
const config = require("../../config/config");
const { QuickDB } = require("quick.db");
const db = new QuickDB();

const mongodb = require("../app/Schemas/MusicBot");
const fs = require("fs");
const { getLang } = require("helpers/language");
const getconfig = require("helpers/getconfig");
const generateImage = require("tools/generateImage");

module.exports = {
  name: "guildMemberRemove",
};

/**
 * on guildMemberRemove event
 * @author earnestangel https://github.com/RirikoAI/RirikoBot
 */
client.on("guildMemberRemove", async (member) => {
  const lang = getLang();

  const prefix =
    (await db.get(`guild_prefix_${member.guild.id}`)) ||
    getconfig.discordPrefix() ||
    "!";

  /**
   * Get leave announce flag for the particular guild
   */
  const announcerEnabled = await db.get(
    `guild_leave_announce_${member.guild.id}`
  );

  /**
   * Get leave announcement channel for the particular guild
   */
  const channelID = await db.get(
    `guild_leave_announce_channel_${member.guild.id}`
  );

  /**
   * Send welcome message to the channel
   */
  try {
    if (announcerEnabled && channelID !== null) {
      const channel = await client.channels.fetch(channelID);
      channel.send({
        embeds: [
          new EmbedBuilder().setDescription(
            `${member.user} has just left the server 😦`
          ),
        ],
      });
    }
  } catch (e) {
    console.error("Something when wrong when sending the leave message", e);
  }
});
