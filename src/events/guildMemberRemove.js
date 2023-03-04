const {
  EmbedBuilder,
  InteractionType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require("discord.js");
const client = require("ririko");
const config = require("config");
const { QuickDB } = require("quick.db");
const db = new QuickDB();

const mongodb = require("../mongoDB");
const fs = require("fs");
const { getLang } = require("utils/language");
const getconfig = require("utils/getconfig");
const generateImage = require("tools/generateImage");

module.exports = {
  name: "guildMemberRemove",
};

client.on("guildMemberRemove", async (member) => {
  const lang = getLang();

  const prefix =
    (await db.get(`guild_prefix_${member.guild.id}`)) ||
    getconfig.discordPrefix() ||
    "!";

  /**
   * Get welcomer flag for the particular guild
   */
  const announcerEnabled = await db.get(
    `guild_leave_announce_${member.guild.id}`
  );

  /**
   * Get welcome announcement channel for the particular guild
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
