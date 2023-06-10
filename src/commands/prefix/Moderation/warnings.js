/**
 * @author saiteja-madha https://github.com/saiteja-madha/discord-js-bot/
 */
const { EmbedBuilder, ApplicationCommandOptionType } = require("discord.js");
const { getWarningLogs, clearWarningLogs } = require("app/schemas/ModLog");
const { getMember } = require("app/schemas/Member");

/**
 * @type {import("@structures/Command")}
 */
module.exports = {
  config: {
    name: "warnings",
    description: "list or clear user warnings",
    usage: "warnings list [@user]\n" + "warnings clear [@user]",
  },
  category: "MODERATION",
  userPermissions: ["KickMembers"],
  command: {
    enabled: true,
    minArgsCount: 1,
    subcommands: [
      {
        trigger: "list [member]",
        description: "list all warnings for a user",
      },
      {
        trigger: "clear <member>",
        description: "clear all warnings for a user",
      },
    ],
  },
  async run(client, message, args, prefix, config, db) {
    if (!args[0] || ((args[0] === "list" || args[0] === "clear") && !args[1])) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Missing argument")
            .setDescription(`See **${prefix}info warnings** for command info`),
        ],
      });
    }

    const sub = args[0]?.toLowerCase();
    let response = "";

    if (sub === "list") {
      const target =
        (await message.guild.resolveMember(args[1], true)) || message.member;
      if (!target) return message.reply(`No user found matching ${args[1]}`);
      response = await listWarnings(target, message);
    }

    //
    else if (sub === "clear") {
      const target = await message.guild.resolveMember(args[1], true);
      if (!target) return message.reply(`No user found matching ${args[1]}`);
      response = await clearWarnings(target, message);
    }

    // else
    else {
      response = `Invalid subcommand ${sub}`;
    }

    await message.reply(response);
  },
};

async function listWarnings(target, { guildId }) {
  if (!target) return "No user provided";
  if (target.user.bot) return "Bots don't have warnings";

  const warnings = await getWarningLogs(guildId, target.id);
  if (!warnings.length) return `${target.user.tag} has no warnings`;

  const acc = warnings
    .map(
      (warning, i) => `${i + 1}. ${warning.reason} [By ${warning.admin.tag}]`
    )
    .join("\n");
  const embed = new EmbedBuilder({
    author: { name: `${target.user.tag}'s warnings` },
    description: acc,
  });

  return { embeds: [embed] };
}

async function clearWarnings(target, { guildId }) {
  if (!target) return "No user provided";
  if (target.user.bot) return "Bots don't have warnings";

  const memberDb = await getMember(guildId, target.id);
  memberDb.warnings = 0;
  await memberDb.save();

  await clearWarningLogs(guildId, target.id);
  return `${target.user.tag}'s warnings have been cleared`;
}
