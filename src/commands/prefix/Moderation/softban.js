/**
 * @author saiteja-madha https://github.com/saiteja-madha/discord-js-bot/
 */
const { softbanTarget } = require("helpers/ModUtils");
const { EmbedBuilder } = require("discord.js");

/**
 * @type {import("@structures/Command")}
 */
module.exports = {
  config: {
    name: "softban",
    description: "softban the specified member. Kicks and deletes messages",
    usage: "softban [@user] [reason]",
  },
  category: "MODERATION",
  botPermissions: ["BanMembers"],
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
            .setDescription(`See **${prefix}info softban** for command info`),
        ],
      });
    }

    const target = await message.guild.resolveMember(args[0], true);
    if (!target) return message.reply(`No user found matching ${args[0]}`);
    const reason = message.content.split(args[0])[1].trim();
    const response = await softban(message.member, target, reason);
    await message.reply(response);
  },
};

async function softban(issuer, target, reason) {
  const response = await softbanTarget(issuer, target, reason);
  if (typeof response === "boolean")
    return `${target.user.tag} is soft-banned!`;
  if (response === "BOT_PERM")
    return `I do not have permission to softban ${target.user.tag}`;
  else if (response === "MEMBER_PERM")
    return `You do not have permission to softban ${target.user.tag}`;
  else return `Failed to softban ${target.user.tag}`;
}
