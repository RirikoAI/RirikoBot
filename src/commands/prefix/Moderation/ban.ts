/**
 * @author saiteja-madha https://github.com/saiteja-madha/discord-js-bot/
 */
const { banTarget } = require("helpers/ModUtils");

/**
 * @type {import("@structures/Command")}
 */
module.exports = {
  config: {
    name: "ban",
    description: "bans the specified member",
    usage: "ban [user] [reason]\n" + "ban [user]",
  },
  category: "Moderation",
  botPermissions: ["BanMembers"],
  permissions: ["BanMembers"],
  command: {
    enabled: true,
    usage: "<ID|@member> [reason]",
    minArgsCount: 1,
  },
  async run(client, message, args, prefix, config, db) {
    const match = await client.resolveUsers(args[0], true);
    const target = match[0];
    if (!target) return message.reply(`No user found matching ${args[0]}`);
    const reason = message.content.split(args[0])[1].trim();
    const response = await ban(message.member, target, reason);
    await message.reply(response);
  },
};

/**
 * @param {import('discord.js').GuildMember} issuer
 * @param {import('discord.js').User} target
 * @param {string} reason
 */
async function ban(issuer, target, reason) {
  const response = await banTarget(issuer, target, reason);
  if (typeof response === "boolean") return `${target.tag} is banned!`;
  if (response === "BOT_PERM")
    return `I do not have permission to ban ${target.tag}`;
  else if (response === "MEMBER_PERM")
    return `You do not have permission to ban ${target.tag}`;
  else return `Failed to ban ${target.tag}`;
}
