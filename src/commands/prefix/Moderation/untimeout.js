/**
 * @author saiteja-madha https://github.com/saiteja-madha/discord-js-bot/
 */
const { unTimeoutTarget } = require("helpers/ModUtils");
const { EmbedBuilder } = require("discord.js");

/**
 * @type {import("@structures/Command")}
 */
module.exports = {
  config: {
    name: "untimeout",
    description: "remove timeout from a member",
    usage: "untimeout [@user] [reason]",
  },
  category: "MODERATION",
  botPermissions: ["ModerateMembers"],
  permissions: ["ModerateMembers"],
  command: {
    enabled: true,
    aliases: ["unmute"],
    usage: "<ID|@member> [reason]",
    minArgsCount: 1,
  },

  async run(client, message, args, prefix, config, db) {
    if (!args[0]) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Missing argument")
            .setDescription(`See **${prefix}info untimeout** for command info`),
        ],
      });
    }
    const target = await message.guild.resolveMember(args[0], true);
    if (!target) return message.reply(`No user found matching ${args[0]}`);
    const reason = args.slice(1).join(" ").trim();
    const response = await untimeout(message.member, target, reason);
    await message.reply(response);
  },
};

async function untimeout(issuer, target, reason) {
  const response = await unTimeoutTarget(issuer, target, reason);
  if (typeof response === "boolean")
    return `Timeout of ${target.user.tag} is removed!`;
  if (response === "BOT_PERM")
    return `I do not have permission to remove timeout of ${target.user.tag}`;
  else if (response === "MEMBER_PERM")
    return `You do not have permission to remove timeout of ${target.user.tag}`;
  else if (response === "NO_TIMEOUT")
    return `${target.user.tag} is not timed out!`;
  else return `Failed to remove timeout of ${target.user.tag}`;
}
