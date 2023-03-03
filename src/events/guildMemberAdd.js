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
  name: "guildMemberAdd",
};

client.on("guildMemberAdd", async (member) => {
  const lang = getLang();

  const prefix =
    (await db.get(`guild_prefix_${member.guild.id}`)) ||
    getconfig.discordPrefix() ||
    "!";

  const img = await generateImage(member);

  (await member.guild.channels.fetch("1080879666702856192"))
    .send({
      content: `${member.user.username}'s base:\n⁣`,
      files: [img],
    })
    .catch((e) => {});

  /**
   * Get welcomer flag for the particular guild
   */
  const announcerEnabled = await db.get(
    `guild_enabled_welcomer_${member.guild.id}`
  );

  /**
   * Get welcome announcement channel for the particular guild
   */
  const channelID = await db.get(
    `guild_welcomer_announce_channel_${member.guild.id}`
  );

  /**
   * Send welcome message to the channel
   */
  try {
    if (announcerEnabled && channelID !== null) {
      const img = await generateImage(member);
      (await member.guild.channels.fetch(channelID))
        .send({
          content: `Welcome to ${member.guild} ${member.user}!`,
          files: [img],
        })
        .catch((e) => {
          console.log(e);
        });
    }
  } catch (e) {
    console.error("Something when wrong when sending the welcome message", e);
  }

  try {
    /**
     * Send new joiner private message with welcome embed
     */
    await member.send({
      embeds: [
        new EmbedBuilder()
          .setAuthor({
            name: `Hello, I'm ${client.user.username}.`,
            iconURL: member.user.displayAvatarURL({
              dynamic: true,
            }),
          })
          .setTitle(`Welcome to ${member.guild.name}! 🎉`)
          .setThumbnail(client.user.displayAvatarURL())
          .setTimestamp()
          .setDescription(
            `I'm so happy you decided to join us here at **${member.guild.name}**. ` +
              "I hope you'd enjoy your stay. We have fun activities here like game together, watch together and music sessions. Or if you'd like to just chill, it's okay too!\n\n" +
              "Please don't forget to read the rules and be a good boy/girl okay^^\n\n" +
              "You may be interested to see what I can do, find a bot command channel in the server and enter this command: " +
              `**${prefix}help**.`
          )
          .setFooter({
            text: `${lang.footer1}`,
          })
          .setColor("Blue"),
      ],
    });
  } catch (e) {
    console.error(
      "Something went wrong when trying to send the member a DM",
      e
    );
  }
});
