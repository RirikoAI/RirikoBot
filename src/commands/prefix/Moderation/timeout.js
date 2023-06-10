/**
 * @author saiteja-madha https://github.com/saiteja-madha/discord-js-bot/
 */
const { timeoutTarget } = require("helpers/ModUtils");
const { ApplicationCommandOptionType, EmbedBuilder } = require("discord.js");
const ems = require("enhanced-ms");

/**
 * @type {import("@structures/Command")}
 */
module.exports = {
  config: {
    name: "timeout",
    description: "timeouts the specified member. Duration can be: 1d/1h/1m/1s",
    usage: "timeout [@user] [duration] [reason]",
  },
  category: "Moderation",
  botPermissions: ["ModerateMembers"],
  permissions: ["ModerateMembers"],
  command: {
    enabled: true,
    aliases: ["mute"],
    usage: "<ID|@member> <duration> [reason]",
    minArgsCount: 2,
  },
  async run(client, message, args, prefix, config, db) {
    if (!args[0]) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Missing argument")
            .setDescription(`See **${prefix}info timeout** for command info`),
        ],
      });
    }

    const target = await message.guild.resolveMember(args[0], true);
    if (!target) return message.reply(`No user found matching ${args[0]}`);

    // parse time
    const ms = ems(args[1]);
    if (!ms)
      return message.reply(
        "Please provide a valid duration. Example: 1d/1h/1m/1s"
      );

    const reason = args.slice(2).join(" ").trim();
    const response = await timeout(message.member, target, ms, reason);
    await message.reply(response);
  },
};

async function timeout(issuer, target, ms, reason) {
  if (isNaN(ms)) return "Please provide a valid duration. Example: 1d/1h/1m/1s";
  const response = await timeoutTarget(issuer, target, ms, reason);
  if (typeof response === "boolean") return `${target.user.tag} is timed out!`;
  if (response === "BOT_PERM")
    return `I do not have permission to timeout ${target.user.tag}`;
  else if (response === "MEMBER_PERM")
    return `You do not have permission to timeout ${target.user.tag}`;
  else if (response === "ALREADY_TIMEOUT")
    return `${target.user.tag} is already timed out!`;
  else return `Failed to timeout ${target.user.tag}`;
}
