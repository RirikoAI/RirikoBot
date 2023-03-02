const { EmbedBuilder } = require("discord.js");

module.exports = {
  config: {
    name: "nitro-announce",
    description:
      "Set/unset the nitro channel and role id for announcement. Use `%user%` to mention the user.",
    usage:
      "nitro-announce channel [channel id]\n" +
      "nitro-announce id [role id]\n" +
      "nitro-announce enable\n" +
      "nitro-announce disable\n" +
      "nitro-announce status",
  },
  permissions: ["Administrator"],
  owner: false,
  run: async (client, message, args, prefix, config, db) => {
    if (!args[0] || ((args[0] === "channel" || args[0] === "id") && !args[1])) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Missing argument")
            .setDescription(
              `See **${prefix}info nitro-announce** for command info`
            ),
        ],
      });
    }

    if (args[0] === "status") {
      const status = await db.get(
          `guild_nitro_announcer_${message.guild.id}`,
          false
        ),
        roleID = await db.get(
          `guild_nitro_role_id_${message.guild.id}`,
          args[1]
        ),
        channelID = await db.get(
          `guild_nitro_announce_channel_${message.guild.id}`,
          args[1]
        );

      if (roleID === null || channelID === null) {
        const disabled = await db.set(
          `guild_nitro_announcer_${message.guild.id}`,
          false
        );

        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("Nitro boost announcer")
              .setDescription(
                `Settings not properly configured. See **${prefix}info nitro-announce**`
              ),
          ],
        });
      }

      // number of Discord Nitro boosters on the server
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

      let roleName, channelName;
      try {
        roleName = await message.channel.guild.roles.fetch(roleID);
      } catch (e) {
        roleName = "<unknown>";
      }

      try {
        channelName = await message.channel.guild.channels.fetch(channelID);
      } catch (e) {
        channelName = "<unknown>";
      }

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

    if (args[0] === "enable") {
      const roleID = await db.get(
          `guild_nitro_role_id_${message.guild.id}`,
          args[1]
        ),
        channelID = await db.get(
          `guild_nitro_announce_channel_${message.guild.id}`,
          args[1]
        );

      if (roleID === null || channelID === null) {
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

      const enabled = await db.set(
        `guild_nitro_announcer_${message.guild.id}`,
        true
      );

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

    if (args[0] === "disable") {
      const disabled = await db.set(
        `guild_nitro_announcer_${message.guild.id}`,
        false
      );

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

    if (args[0] === "id") {
      let roleName;
      try {
        roleName = await message.channel.guild.roles.fetch(args[1]);

        if (!roleName) throw new Error("role not found");

        const role_id = await db.set(
          `guild_nitro_role_id_${message.guild.id}`,
          args[1]
        );

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

    if (args[0] === "channel") {
      let channelName;
      try {
        channelName = await message.channel.guild.channels.fetch(args[1]);

        if (!channelName) throw new Error("role not found");

        const channel_id = await db.set(
          `guild_nitro_announce_channel_${message.guild.id}`,
          args[1]
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
  },
};
