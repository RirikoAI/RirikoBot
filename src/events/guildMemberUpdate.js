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

module.exports = {
  name: "guildMemberUpdate",
};

/**
 * on guildMemberUpdate event
 * @author earnestangel https://github.com/RirikoAI/RirikoBot
 */
client.on("guildMemberUpdate", async (oldMember, newMember) => {
  const boostAnnouncerEnabled = await db.get(
    `guild_nitro_announcer_${newMember.guild.id}`
  );

  if (boostAnnouncerEnabled) {
    const oldStatus = oldMember.premiumSince;
    const newStatus = newMember.premiumSince;

    let nitro_announce_channel, nitro_role_id;

    nitro_announce_channel = await db.get(
      `guild_nitro_announce_channel_${newMember.guild.id}`
    );

    nitro_role_id = await db.get(`guild_nitro_role_id_${newMember.guild.id}`);

    if (nitro_announce_channel !== null) {
      if (!oldStatus && newStatus) {
        client.channels.cache
          // channel id to send announcements
          .get(nitro_announce_channel)
          .send(
            config.nitroAnnouncer.message.replace(
              "%user%",
              "<@" + newMember.user.id + ">"
            )
          );
      }
    }

    // if (oldStatus && !newStatus) {
    //   client.channels.cache
    //     .get("1080879666702856192")
    //     .send(`Sadly <@${newMember.user.id}>, just unboosted this server`);
    // }

    if (nitro_role_id !== null) {
      newMember.guild.members.fetch().then((members) => {
        let users = 0;
        const test = members
          // role id for nitro boosters
          .filter((mmbr) => mmbr.roles.cache.get(nitro_role_id))
          .map((m) => {
            users++;
            return m.user.tag;
          })
          .join("\n");
        // console.log(`${users} users boosted the server`);
      });
    }
  }
});
