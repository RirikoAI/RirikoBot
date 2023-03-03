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
const { getLang } = require("../utils/language");
const getconfig = require("../utils/getconfig");

module.exports = {
  name: "guildMemberAdd",
};

client.on("guildMemberAdd", async (member) => {
  const lang = getLang();

  const prefix =
    (await db.get(`guild_prefix_${member.guild.id}`)) ||
    getconfig.discordPrefix() ||
    "!";

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
});
