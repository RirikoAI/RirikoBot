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

const { removeReactionRole } = require("app/Schemas/ReactionRoles");

module.exports = {
  category: "Roles",
  userPermissions: ["ManageGuild"],
  config: {
    name: "removerr",
    description: "Remove configured reaction for the specified message",
    enabled: true,
    usage: "removerr [channelID] [messageID]",
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
            .setDescription(`See **${prefix}info removerr** for more info`),
        ],
      });

    const targetChannel = message.guild.findMatchingChannels(args[0]);
    if (targetChannel.length === 0)
      return message.reply(`No channels found matching ${args[0]}`);

    const targetMessage = args[1];
    const response = await removeRR(
      message.guild,
      targetChannel[0],
      targetMessage
    );

    await message.reply(response);
  },
};

/**
 * @author saiteja-madha https://github.com/saiteja-madha/discord-js-bot
 *
 * @param guild
 * @param channel
 * @param messageId
 * @returns {Promise<string>}
 */
async function removeRR(guild, channel, messageId) {
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

  try {
    await removeReactionRole(guild.id, channel.id, targetMessage.id);
    await targetMessage.reactions?.removeAll();
  } catch (ex) {
    return "Oops! An unexpected error occurred. Try again later";
  }

  return "Done! Configuration updated";
}
