/**
 * @author saiteja-madha https://github.com/saiteja-madha/discord-js-bot/
 */
const { canModerate } = require("helpers/ModUtils");
const { EmbedBuilder } = require("discord.js");

/**
 * @type {import("@structures/Command")}
 */
module.exports = {
  config: {
    name: "nick",
    description: "nickname commands",
    usage: "nick set [@member] [nick]\n" + "nick reset [@member]",
  },
  category: "MODERATION",
  permissions: ["ManageNicknames"],
  botPermissions: ["ManageNicknames"],
  command: {
    enabled: true,
    minArgsCount: 2,
    subcommands: [
      {
        trigger: "set <@member> <name>",
        description: "sets the nickname of the specified member",
      },
      {
        trigger: "reset <@member>",
        description: "reset a members nickname",
      },
    ],
  },

  async run(client, message, args, prefix, config, db) {
    if (!args[0]) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Missing argument")
            .setDescription(`See **${prefix}info nick** for command info`),
        ],
      });
    }

    const sub = args[0].toLowerCase();

    if (sub === "set") {
      const target = await message.guild.resolveMember(args[1]);
      if (!target) return message.reply("Could not find matching member");
      const name = args.slice(2).join(" ");
      if (!name) return message.reply("Please specify a nickname");

      const response = await nickname(message, target, name);
      return message.reply(response);
    }

    //
    else if (sub === "reset") {
      const target = await message.guild.resolveMember(args[1]);
      if (!target) return message.reply("Could not find matching member");

      const response = await nickname(message, target);
      return message.reply(response);
    } else {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Missing argument")
            .setDescription(`See **${prefix}info nick** for command info`),
        ],
      });
    }
  },
};

async function nickname({ member, guild }, target, name) {
  if (!canModerate(member, target)) {
    return `Oops! You cannot manage nickname of ${target.user.tag}`;
  }
  if (!canModerate(guild.members.me, target)) {
    return `Oops! I cannot manage nickname of ${target.user.tag}`;
  }

  try {
    await target.setNickname(name);
    return `Successfully ${name ? "changed" : "reset"} nickname of ${
      target.user.tag
    }`;
  } catch (ex) {
    return `Failed to ${name ? "change" : "reset"} nickname for ${
      target.displayName
    }. Did you provide a valid name?`;
  }
}
