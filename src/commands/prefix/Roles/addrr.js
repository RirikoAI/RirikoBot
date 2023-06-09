const {
  parseEmoji,
  ApplicationCommandOptionType,
  ChannelType,
  EmbedBuilder,
} = require("discord.js");
const { parsePermissions } = require("helpers/Utils");

const channelPerms = [
  "EmbedLinks",
  "ReadMessageHistory",
  "AddReactions",
  "UseExternalEmojis",
  "ManageMessages",
];

const {
  addReactionRole,
  getReactionRoles,
} = require("app/Schemas/ReactionRoles");

module.exports = {
  category: "Roles",
  userPermissions: ["ManageGuild"],
  config: {
    name: "addrr",
    description: "setup reaction role for the specified message",
    enabled: true,
    usage: "addrr [channelID] [messageID] [emote] [role to be given]",
    minArgsCount: 1,
  },
  /**
   * Command runner
   * @author saiteja-madha https://github.com/saiteja-madha/discord-js-bot
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
  async run(client, message, args, prefix, config, db) {
    if (!args[0])
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("Missing argument")
            .setDescription(`See **${prefix}info addrr** for more info`),
        ],
      });

    const targetChannel = message.guild.findMatchingChannels(args[0]);
    if (targetChannel.length === 0)
      return message.reply(`No channels found matching ${args[0]}`);

    const targetMessage = args[1];

    const role = message.guild.findMatchingRoles(args[3])[0];
    if (!role) return message.reply(`No roles found matching ${args[3]}`);

    const reaction = args[2];

    const response = await addRR(
      message.guild,
      targetChannel[0],
      targetMessage,
      reaction,
      role
    );
    await message.reply(response);
  },
};

async function addRR(guild, channel, messageId, reaction, role) {
  if (!channel.permissionsFor(guild.members.me).has(channelPerms)) {
    return `You need the following permissions in ${channel.toString()}\n${parsePermissions(
      channelPerms
    )}`;
  }

  let targetMessage;
  try {
    targetMessage = await channel.messages.fetch({ message: messageId });
  } catch (ex) {
    return "Could not fetch message. Did you provide a valid messageId?";
  }

  if (role.managed) {
    return "I cannot assign bot roles.";
  }

  if (guild.roles.everyone.id === role.id) {
    return "You cannot assign the everyone role.";
  }

  if (guild.members.me.roles.highest.position < role.position) {
    return "Oops! I cannot add/remove members to that role. Is that role higher than mine?";
  }

  const custom = parseEmoji(reaction);
  if (custom.id && !guild.emojis.cache.has(custom.id))
    return "This emoji does not belong to this server";
  const emoji = custom.id ? custom.id : custom.name;

  try {
    await targetMessage.react(emoji);
  } catch (ex) {
    return `Oops! Failed to react. Is this a valid emoji: ${reaction} ?`;
  }

  let reply = "";
  const previousRoles = getReactionRoles(
    guild.id,
    channel.id,
    targetMessage.id
  );
  if (previousRoles.length > 0) {
    const found = previousRoles.find((rr) => rr.emote === emoji);
    if (found)
      reply =
        "A role is already configured for this emoji. Overwriting data,\n";
  }

  await addReactionRole(guild.id, channel.id, targetMessage.id, emoji, role.id);
  return (reply += "Done! Configuration saved");
}
