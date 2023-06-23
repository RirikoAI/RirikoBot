const { EmbedBuilder } = require("discord.js");

module.exports = {
  config: {
    name: "nitro-announcer",
    description:
      "Set/unset the nitro channel and role id for announcement. Use `%user%` to mention the user.",
    usage:
      "nitro-announcer channel [channel id]\n" +
      "nitro-announcer id [role id]\n" +
      "nitro-announcer enable\n" +
      "nitro-announcer disable\n" +
      "nitro-announcer status",
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
    if (!args[0] || ((args[0] === "channel" || args[0] === "id") && !args[1])) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Missing argument")
            .setDescription(
              `See **${prefix}info nitro-announcer** for command info`
            ),
        ],
      });
    }

    if (args[0] === "status") {
      return getStatus(db, message, args, prefix);
    }

    if (args[0] === "enable") {
      return enableNitroAnnouncer(message, db);
    }

    if (args[0] === "disable") {
      return disableNitroAnnouncer(message, db);
    }

    if (args[0] === "id") {
      return await setNitroRoleID(message, db, args[1]);
    }

    if (args[0] === "channel") {
      return await setNitroAnnouncementChannelID(message, db, args[1]);
    }
  },
};

/**
 * Get the guild's nitro announcement flag
 * @param db
 * @param message
 * @param args
 * @param prefix
 * @returns {Promise<*>}
 */
async function getStatus(db, message, args, prefix) {
  // check if the guild has enabled the nitro announcement feature and if the settings are properly configured
  const validSettings = checkSettings(message, db);

  if (!validSettings) {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("Nitro boost announcer")
          .setDescription(
            `Please check your settings before enabling this feature`
          ),
      ],
    });
  }

  const status = await getGuildNitroAnnouncementFlagDb(message.guild.id, db),
    roleID = await getGuildNitroRoleIDDb(message.guild.id, db),
    channelID = await getGuildNitroAnnouncementChannelDb(message.guild.id, db);

  // number of Discord Nitro boosters on the server
  const users = await getNitroBoostersCount(message, roleID);
  const roleName = await getRoleById(roleID, message);
  const channelName = await getChannelById(channelID, message);

  // send message to the user with the current settings
  return message.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle("Nitro boost announcer")
        .setDescription(
          `Enabled: ${status}\nRole: ${roleName} ${roleID}\nChannel: ${channelName} ${channelID}\nNumber of Boosters: ${users}`
        ),
    ],
  });
}

/**
 * Set nitro announcement channel
 * @param message
 * @param db
 * @param channelId
 * @returns {Promise<*>}
 */
async function setNitroAnnouncementChannelID(message, db, channelId) {
  let channelName;
  try {
    channelName = await message.channel.guild.channels.fetch(channelId);

    if (!channelName) throw new Error("role not found");

    const channel_id = await db.set(
      `guild_nitro_announce_channel_${message.guild.id}`,
      channelId
    );

    const embed = new EmbedBuilder()
      .setTitle("Success!")
      .setDescription(
        `${channelName} set as the channel for announcing new nitro boosts.`
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

/**
 * Set nitro / server booster role id
 * @param message
 * @param db
 * @param roleId
 * @returns {Promise<*>}
 */
async function setNitroRoleID(message, db, roleId) {
  let roleName;
  try {
    roleName = await message.channel.guild.roles.fetch(roleId);

    if (!roleName) throw new Error("role not found");

    await db.set(`guild_nitro_role_id_${message.guild.id}`, roleId);

    const embed = new EmbedBuilder()
      .setTitle("Success!")
      .setDescription(`${roleName} acknowledged as the nitro booster role.`)
      .setColor("Green");

    return message.reply({ embeds: [embed] });
  } catch (e) {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("Role not found")
          .setDescription(`Please check the role id`),
      ],
    });
  }
}

/**
 * Disable nitro announcer
 * @param message
 * @param db
 * @returns {Promise<*>}
 */
async function disableNitroAnnouncer(message, db) {
  await disableGuildNitroAnnouncementDb(message.guild.id, db);
  return message.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle("Nitro boost announcer")
        .setDescription(
          `Nitro boost announcer has been **disabled** for the server`
        ),
    ],
  });
}

/**
 * Enable nitro announcer
 * @param message
 * @param db
 * @returns {Promise<*>}
 */
async function enableNitroAnnouncer(message, db) {
  const validSettings = checkSettings(message, db);

  if (!validSettings) {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("Nitro boost announcer")
          .setDescription(
            `Please check your settings before enabling this feature`
          ),
      ],
    });
  }

  await enableGuildNitroAnnouncementDb(message.guild.id, db);

  return message.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle("Nitro boost announcer")
        .setDescription(
          `Nitro boost announcer has been **enabled** for the server`
        ),
    ],
  });
}

/**
 * Check if the guild has the required settings for the nitro announcer
 * @param guildId
 * @param db
 * @returns {Promise<boolean>}
 */
async function checkSettings(guildId, db) {
  const roleID = await db.get(`guild_nitro_role_id_${guildId}`, null),
    channelID = await db.get(`guild_nitro_announce_channel_${guildId}`, null);

  return !(roleID === null || channelID === null);
}

/**
 * Get the guild nitro announcement flag
 * @param guildId
 * @param db
 * @returns {Promise<*>}
 */
async function enableGuildNitroAnnouncementDb(guildId, db) {
  return db.set(`guild_nitro_announcer_${guildId}`, true);
}

/**
 * Disable the guild nitro announcement flag
 * @param guildId
 * @param db
 * @returns {Promise<*>}
 */
async function disableGuildNitroAnnouncementDb(guildId, db) {
  return db.set(`guild_nitro_announcer_${guildId}`, false);
}

/**
 * Get the guild's nitro announcement flag
 * @param guildId
 * @param db
 * @returns {Promise<*>}
 */
async function getGuildNitroAnnouncementFlagDb(guildId, db) {
  return db.get(`guild_nitro_announcer_${guildId}`, null);
}

/**
 * Get the guild's nitro role id
 * @param guildId
 * @param db
 * @returns {Promise<*>}
 */
async function getGuildNitroRoleIDDb(guildId, db) {
  return db.get(`guild_nitro_role_id_${guildId}`, null);
}

/**
 * Get the guild's nitro announcement channel
 * @param guildId
 * @param db
 * @returns {Promise<*>}
 */
async function getGuildNitroAnnouncementChannelDb(guildId, db) {
  return db.get(`guild_nitro_announce_channel_${guildId}`, null);
}

/**
 * Get the role by id
 * @param roleID
 * @param message
 * @returns {Promise<*|string>}
 */
async function getRoleById(roleID, message) {
  try {
    return message.channel.guild.roles.cache.get(roleID);
  } catch (e) {
    return "<unknown>";
  }
}

/**
 * Get the channel by id
 * @param channelID
 * @param message
 * @returns {Promise<*|string>}
 */
async function getChannelById(channelID, message) {
  try {
    return message.channel.guild.channels.cache.get(channelID);
  } catch (e) {
    return "<unknown>";
  }
}

/**
 * Get the number of nitro boosters on the server
 * @param message
 * @param roleID
 * @returns {Promise<number>}
 */
async function getNitroBoostersCount(message, roleID) {
  let users = 0;
  await message.channel.guild.members.fetch().then((members) => {
    const test = members
      // role id for nitro boosters
      .filter((mmbr) => mmbr.roles.cache.get(roleID))
      .map((m) => {
        users++;
        return m.user.tag;
      })
      .join("\n");
  });
  return users;
}
