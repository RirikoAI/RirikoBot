/**
 * @author saiteja-madha https://github.com/saiteja-madha/discord-js-bot/
 */
const { warnTarget } = require("helpers/ModUtils");
const { EmbedBuilder } = require("discord.js");

/**
 * @type {import("@structures/Command")}
 */
module.exports = {
  config: {
    name: "warn",
    description: "warns the specified member",
    usage: "warn [@user] [reason]",
  },
  category: "MODERATION",
  permissions: ["KickMembers"],
  command: {
    enabled: true,
    usage: "<ID|@member> [reason]",
    minArgsCount: 1,
  },
  async run(client, message, args, prefix, config, db) {
    if (!args[0]) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Missing argument")
            .setDescription(`See **${prefix}info warn** for command info`),
        ],
      });
    }
    const target = await message.guild.resolveMember(args[0], true);
    if (!target) return message.reply(`No user found matching ${args[0]}`);
    const reason = message.content.split(args[0])[1].trim();
    const response = await warn(message.member, target, reason);
    await message.reply(response);
  },
};

async function warn(issuer, target, reason) {
  const response = await warnTarget(issuer, target, reason);
  if (typeof response === "boolean") return `${target.user.tag} is warned!`;
  if (response === "BOT_PERM")
    return `I do not have permission to warn ${target.user.tag}`;
  else if (response === "MEMBER_PERM")
    return `You do not have permission to warn ${target.user.tag}`;
  else return `Failed to warn ${target.user.tag}`;
}
